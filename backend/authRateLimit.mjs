const actions = new Set(["challenge_issue", "challenge_verify", "account_recovery"]);

// subjectDigest must be keyed and derived server-side from the rate-limit
// subject. Never pass through a digest chosen by the client.
export async function reserveAuthAttempt(database, { action, subjectDigest, now, windowSeconds, limit }) {
  if (!actions.has(action) || typeof subjectDigest !== "string" || !/^[a-f0-9]{64}$/.test(subjectDigest)
    || !Number.isSafeInteger(now) || now < 0
    || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1
    || !Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError("invalid authentication rate limit");
  }
  const windowStart = now - (now % windowSeconds);
  const row = await database.prepare(`
    INSERT INTO subscriber_auth_rate_limit(action, subject_digest, window_start, attempts)
    VALUES (?1, ?2, ?3, 1)
    ON CONFLICT (action, subject_digest) DO UPDATE SET
        window_start = excluded.window_start,
        attempts = CASE WHEN subscriber_auth_rate_limit.window_start < excluded.window_start
            THEN 1 ELSE subscriber_auth_rate_limit.attempts + 1 END
    WHERE subscriber_auth_rate_limit.window_start < excluded.window_start
        OR (subscriber_auth_rate_limit.window_start = excluded.window_start
            AND subscriber_auth_rate_limit.attempts < ?4)
    RETURNING attempts
  `).bind(action, subjectDigest, windowStart, limit).first();
  return row !== null;
}
