import { createSessionSecret, prepareSessionClaim } from "./sessions.mjs";

// The provider adapter must authenticate its event and canonicalize its sender
// before invoking consumeVerifiedEvent. No real provider is configured here.
const encoder = new TextEncoder();
const purposes = new Set(["registration", "login", "recovery"]);
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
  if (purpose === "recovery" || !purposes.has(purpose) || !channels.has(channel) || !sender || typeof proof !== "string"
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

// Both events must have been authenticated by the configured channel adapters.
// This handles a lost device with unchanged verified contacts. Contact changes
// and administrator-assisted recovery require their own authorization flows.
export async function recoverVerifiedDevice(database, key, events, {
  subscriberId, now, expiresAt, deviceLabel = null,
}) {
  if (!subscriberId || !Array.isArray(events) || !Number.isSafeInteger(now) || now < 0
    || !Number.isSafeInteger(expiresAt) || expiresAt <= now) throw new TypeError("invalid device recovery");
  const phone = events.find(event => event?.channel === "whatsapp");
  const email = events.find(event => event?.channel === "email");
  if (!phone || events.length !== (email ? 2 : 1)) return null;
  const claims = [];
  for (const event of events) {
    if (event.purpose !== "recovery" || typeof event.id !== "string" || typeof event.sender !== "string"
      || !/^[0-9a-f]{64}$/.test(event.proof)) return null;
    claims.push({
      id: event.id, channel: event.channel, sender: event.sender,
      proofDigest: await fingerprint(key, "proof", event.proof),
      targetDigest: await fingerprint(key, "target", event.sender),
    });
  }
  const { token, tokenDigest } = await createSessionSecret();
  const claimSession = database.prepare(`
    INSERT INTO subscriber_session
      (subscriber_id, token_digest, device_label, issued_at, last_seen_at, expires_at)
    SELECT id, ?2, ?3, ?4, ?4, ?5 FROM subscriber AS account
    WHERE id = ?1 AND state = 'active' AND phone_verified_at <= ?4
      AND ((email IS NULL AND ?7 = 1) OR (email_verified_at <= ?4 AND ?7 = 2))
      AND NOT EXISTS (
        SELECT 1 FROM json_each(?6) AS candidate
        WHERE NOT EXISTS (
          SELECT 1 FROM subscriber_verification_challenge AS challenge
          WHERE challenge.id = json_extract(candidate.value, '$.id')
            AND challenge.subscriber_id = account.id AND challenge.purpose = 'recovery'
            AND challenge.channel = json_extract(candidate.value, '$.channel')
            AND challenge.proof_digest = json_extract(candidate.value, '$.proofDigest')
            AND challenge.target_digest = json_extract(candidate.value, '$.targetDigest')
            AND (CASE challenge.channel WHEN 'whatsapp' THEN account.phone ELSE account.email END)
              = json_extract(candidate.value, '$.sender')
            AND challenge.created_at <= ?4 AND challenge.expires_at > ?4 AND challenge.consumed_at IS NULL
        )
      )
    ON CONFLICT (subscriber_id) DO UPDATE SET
      token_digest = excluded.token_digest, device_label = excluded.device_label,
      issued_at = excluded.issued_at, last_seen_at = excluded.last_seen_at,
      expires_at = excluded.expires_at, revoked_at = NULL
    WHERE subscriber_session.issued_at <= excluded.issued_at
    RETURNING subscriber_id
  `).bind(subscriberId, tokenDigest, deviceLabel, now, expiresAt, JSON.stringify(claims), claims.length);
  const consume = database.prepare(`
    UPDATE subscriber_verification_challenge SET consumed_at = ?3
    WHERE subscriber_id = ?1 AND id IN (SELECT value FROM json_each(?4))
      AND EXISTS (SELECT 1 FROM subscriber_session WHERE subscriber_id = ?1 AND token_digest = ?2)
  `).bind(subscriberId, tokenDigest, now, JSON.stringify(claims.map(claim => claim.id)));
  const audit = database.prepare(`
    INSERT INTO subscriber_audit_event (id, subscriber_id, actor_type, actor_id, event_type, occurred_at)
    SELECT ?3, subscriber_id, 'subscriber', subscriber_id, 'recovery_completed', ?4
    FROM subscriber_session WHERE subscriber_id = ?1 AND token_digest = ?2
  `).bind(subscriberId, tokenDigest, crypto.randomUUID(), now);
  const [session] = await database.batch([claimSession, consume, audit]);
  return session.results.length ? { token, expiresAt } : null;
}
