import { prepareSessionClaim } from "./sessions.mjs";

// The provider adapter must authenticate its event and canonicalize its sender
// before invoking consumeVerifiedEvent. No real provider is configured here.
const encoder = new TextEncoder();
const purposes = new Set(["registration", "login"]);
const channels = new Set(["email", "whatsapp"]);

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function fingerprint(key, context, value) {
  const data = encoder.encode(JSON.stringify([context, value]));
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, data)));
}

export async function createVerificationChallenge(database, key, {
  subscriberId, purpose, channel, target, now, expiresAt,
}) {
  if (!purposes.has(purpose) || !channels.has(channel) || !target
    || !Number.isSafeInteger(now) || !Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    throw new TypeError("invalid verification challenge");
  }

  const id = crypto.randomUUID();
  const proof = hex(crypto.getRandomValues(new Uint8Array(32)));
  const row = await database.prepare(`
    INSERT INTO subscriber_verification_challenge
       (id, subscriber_id, purpose, channel, proof_digest, target_digest, created_at, expires_at)
    SELECT ?1, id, ?3, ?4, ?5, ?6, ?7, ?8 FROM subscriber
    WHERE id = ?2 AND state <> 'suspended'
      AND CASE ?4 WHEN 'whatsapp' THEN phone ELSE email END = ?9
    RETURNING id
  `).bind(id, subscriberId, purpose, channel,
    await fingerprint(key, "proof", proof), await fingerprint(key, "target", target),
    now, expiresAt, target).first();
  return row ? { id, proof, expiresAt } : null;
}

async function prepareConsumption(database, key, { id, purpose, channel, sender, proof }, now, loginClaim = null, subscriberId = null) {
  if (!purposes.has(purpose) || !channels.has(channel) || !sender || typeof proof !== "string"
    || !/^[0-9a-f]{64}$/.test(proof) || !Number.isSafeInteger(now)) return null;

  return database.prepare(`
    UPDATE subscriber_verification_challenge AS challenge SET consumed_at = ?7, login_claim = ?8
    WHERE id = ?1 AND purpose = ?2 AND channel = ?3 AND proof_digest = ?4 AND target_digest = ?5
      AND consumed_at IS NULL AND created_at <= ?7 AND expires_at > ?7
      AND (?9 IS NULL OR subscriber_id = ?9)
      AND EXISTS (
        SELECT 1 FROM subscriber WHERE id = challenge.subscriber_id AND state <> 'suspended'
          AND CASE ?3 WHEN 'whatsapp' THEN phone ELSE email END = ?6
      )
    RETURNING subscriber_id AS subscriberId
  `).bind(id, purpose, channel, await fingerprint(key, "proof", proof),
    await fingerprint(key, "target", sender), sender, now, loginClaim, subscriberId);
}

export async function consumeVerifiedEvent(database, key, event, now) {
  const statement = await prepareConsumption(database, key, event, now);
  return statement ? statement.first() : null;
}

// The provider must authenticate the event. subscriberId and expiry policy
// come from the trusted login service, not from a browser or provider payload.
export async function consumeVerifiedLogin(database, key, event, { subscriberId, now, expiresAt, deviceLabel }) {
  if (event.purpose !== "login" || !subscriberId) return null;
  const loginClaim = crypto.randomUUID();
  const consume = await prepareConsumption(database, key, event, now, loginClaim, subscriberId);
  if (!consume) return null;
  const next = await prepareSessionClaim(database, {
    subscriberId, now, expiresAt, deviceLabel, challengeId: event.id, loginClaim,
  });
  const [, session] = await database.batch([consume, next.statement]);
  return session.results.length === 1 ? { token: next.token, expiresAt: next.expiresAt } : null;
}
