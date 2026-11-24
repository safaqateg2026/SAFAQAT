// Private persistence primitives. Call issueVerifiedSession only after the
// authentication service has atomically verified and consumed its challenge.
// The database adapter must support D1's prepare/bind/first interface.
const encoder = new TextEncoder();

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(token) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));
}

export async function issueVerifiedSession(database, { subscriberId, now, expiresAt, deviceLabel = null }) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    throw new RangeError("invalid session timestamps");
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const row = await database.prepare(`
    INSERT INTO subscriber_session
        (subscriber_id, token_digest, device_label, issued_at, last_seen_at, expires_at)
    SELECT id, ?2, ?3, ?4, ?4, ?5 FROM subscriber
    WHERE id = ?1 AND state = 'active'
    ON CONFLICT (subscriber_id) DO UPDATE SET
        token_digest = excluded.token_digest,
        device_label = excluded.device_label,
        issued_at = excluded.issued_at,
        last_seen_at = excluded.last_seen_at,
        expires_at = excluded.expires_at,
        revoked_at = NULL
    WHERE subscriber_session.expires_at <= excluded.issued_at
       OR subscriber_session.revoked_at <= excluded.issued_at
    RETURNING subscriber_id
  `).bind(subscriberId, await digest(token), deviceLabel, now, expiresAt).first();
  return row ? { token, expiresAt } : null;
}

export async function findActiveSession(database, token, now) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token) || !Number.isSafeInteger(now)) return null;
  return database.prepare(`
    SELECT account.id AS subscriberId, account.role, session.expires_at AS expiresAt
    FROM subscriber_session AS session
    JOIN subscriber AS account ON account.id = session.subscriber_id
    WHERE session.token_digest = ?1 AND session.issued_at <= ?2
      AND session.expires_at > ?2 AND session.revoked_at IS NULL AND account.state = 'active'
  `).bind(await digest(token), now).first();
}

export async function revokeSession(database, token, now) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token) || !Number.isSafeInteger(now)) return false;
  const row = await database.prepare(`
    UPDATE subscriber_session SET revoked_at = ?2
    WHERE token_digest = ?1 AND issued_at <= ?2 AND revoked_at IS NULL
    RETURNING subscriber_id
  `).bind(await digest(token), now).first();
  return Boolean(row);
}
