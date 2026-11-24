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

export async function consumeVerifiedEvent(database, key, { id, purpose, channel, sender, proof }, now) {
  if (!purposes.has(purpose) || !channels.has(channel) || !sender || typeof proof !== "string"
    || !/^[0-9a-f]{64}$/.test(proof) || !Number.isSafeInteger(now)) return null;

  return database.prepare(`
    UPDATE subscriber_verification_challenge AS challenge SET consumed_at = ?7
    WHERE id = ?1 AND purpose = ?2 AND channel = ?3 AND proof_digest = ?4 AND target_digest = ?5
      AND consumed_at IS NULL AND created_at <= ?7 AND expires_at > ?7
      AND EXISTS (
        SELECT 1 FROM subscriber WHERE id = challenge.subscriber_id AND state <> 'suspended'
          AND CASE ?3 WHEN 'whatsapp' THEN phone ELSE email END = ?6
      )
    RETURNING subscriber_id AS subscriberId
  `).bind(id, purpose, channel, await fingerprint(key, "proof", proof),
    await fingerprint(key, "target", sender), sender, now).first();
}
