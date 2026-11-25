import { reserveAuthAttempt } from "./authRateLimit.mjs";

const encoder = new TextEncoder();

const phonePattern = /^\+201[0-9]{9}$/;
const tokenPattern = /^[0-9a-f]{64}$/;
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function validTime(now) {
  return Number.isSafeInteger(now) && now >= 0;
}

function validPhone(phone) {
  return typeof phone === "string" &&
    phonePattern.test(phone);
}

function validToken(token) {
  return typeof token === "string" &&
    tokenPattern.test(token);
}

function validId(id) {
  return typeof id === "string" &&
    idPattern.test(id);
}

function hex(bytes) {
  return Array.from(
    bytes,
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

function randomToken() {
  return hex(
    crypto.getRandomValues(new Uint8Array(32))
  );
}

async function digest(key, context, value) {
  return hex(new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(JSON.stringify([
        "pending-registration-v1",
        context,
        value
      ]))
    )
  ));
}

export async function createPendingRegistration(
  database,
  key,
  {
    phone,
    rateSubject,
    now,
    expiresAt
  }
) {
  if (!validPhone(phone) ||
      typeof rateSubject !== "string" ||
      rateSubject.length < 1 ||
      rateSubject.length > 256 ||
      !validTime(now) ||
      !validTime(expiresAt) ||
      expiresAt <= now ||
      expiresAt - now > 1800) {
    throw new TypeError("invalid pending registration");
  }

  const phoneDigest = await digest(
    key, "phone", phone
  );

  for (const [context, subject, limit] of [
    ["request-source", rateSubject, 20],
    ["request-phone", phone, 5]
  ]) {
    const allowed = await reserveAuthAttempt(
      database, {
        action: "challenge_issue",
        subjectDigest: await digest(
          key, context, subject
        ),
        now,
        windowSeconds: 300,
        limit
      }
    );

    if (!allowed) return null;
  }

  const id = crypto.randomUUID();
  const proof = randomToken();
  const browserSecret = randomToken();

  const row = await database.prepare(`
    INSERT INTO pending_registration (
      id, phone_digest, proof_digest,
      browser_digest, created_at, expires_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    RETURNING id
  `).bind(
    id,
    phoneDigest,
    await digest(key, "proof", proof),
    await digest(key, "browser", browserSecret),
    now,
    expiresAt
  ).first();

  return row
    ? { id, proof, browserSecret, expiresAt }
    : null;
}

// Only an authenticated provider adapter may call this.
export async function verifyPendingRegistration(
  database, key, event, now
) {
  if (!event ||
      event.purpose !== "registration" ||
      !validId(event.id) ||
      !validPhone(event.sender) ||
      !validToken(event.proof) ||
      !validTime(now)) return false;

  const row = await database.prepare(`
    UPDATE pending_registration
    SET verified_at = ?4
    WHERE id = ?1
      AND phone_digest = ?2
      AND proof_digest = ?3
      AND verified_at IS NULL
      AND claimed_at IS NULL
      AND created_at <= ?4
      AND expires_at > ?4
    RETURNING id
  `).bind(
    event.id,
    await digest(key, "phone", event.sender),
    await digest(key, "proof", event.proof),
    now
  ).first();

  return row !== null;
}

export async function readPendingRegistration(
  database, key,
  { id, browserSecret, phone },
  now
) {
  if (!validId(id) ||
      !validToken(browserSecret) ||
      !validPhone(phone) ||
      !validTime(now)) return null;

  const row = await database.prepare(`
    SELECT verified_at AS verifiedAt
    FROM pending_registration
    WHERE id = ?1
      AND browser_digest = ?2
      AND phone_digest = ?3
      AND created_at <= ?4
      AND expires_at > ?4
      AND claimed_at IS NULL
  `).bind(
    id,
    await digest(key, "browser", browserSecret),
    await digest(key, "phone", phone),
    now
  ).first();

  if (!row) return null;

  return {
    verified:
      Number.isSafeInteger(row.verifiedAt) &&
      row.verifiedAt <= now
  };
}

export async function purgeExpiredPendingRegistrations(
  database, now
) {
  if (!validTime(now)) {
    throw new TypeError("invalid cleanup time");
  }

  const result = await database.prepare(`
    DELETE FROM pending_registration
    WHERE id IN (
      SELECT id
      FROM pending_registration
      WHERE expires_at <= ?1
      ORDER BY expires_at
      LIMIT 100
    )
    RETURNING id
  `).bind(now).all();

  return result.results.length;
}
