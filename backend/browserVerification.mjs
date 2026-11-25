const encoder = new TextEncoder();

const tokenPattern = /^[0-9a-f]{64}$/;

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function hex(bytes) {
  return Array.from(
    bytes,
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

function bytes(value) {
  return Uint8Array.from(
    value.match(/.{2}/g),
    pair => Number.parseInt(pair, 16)
  );
}

function validId(value) {
  return typeof value === "string" &&
    idPattern.test(value);
}

function validToken(value) {
  return typeof value === "string" &&
    tokenPattern.test(value);
}

function context({
  challengeId,
  subscriberId,
  expiresAt,
  browserSecret
}) {
  return encoder.encode(JSON.stringify([
    "safaqat-browser-registration-v1",
    challengeId,
    subscriberId,
    expiresAt,
    browserSecret
  ]));
}

export async function createBrowserBinding(
  key,
  { challengeId, subscriberId, now, expiresAt }
) {
  if (!validId(challengeId) ||
      !validId(subscriberId) ||
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now ||
      expiresAt - now > 1800) {
    throw new TypeError("invalid browser binding");
  }

  const browserSecret = hex(
    crypto.getRandomValues(new Uint8Array(32))
  );

  const binding = {
    challengeId,
    subscriberId,
    expiresAt,
    browserSecret
  };

  const signature = hex(new Uint8Array(
    await crypto.subtle.sign(
      "HMAC", key, context(binding)
    )
  ));

  return { ...binding, signature };
}

export async function verifyBrowserBinding(
  key, binding, now
) {
  if (!binding ||
      !validId(binding.challengeId) ||
      !validId(binding.subscriberId) ||
      !validToken(binding.browserSecret) ||
      !validToken(binding.signature) ||
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !Number.isSafeInteger(binding.expiresAt) ||
      binding.expiresAt <= now ||
      binding.expiresAt - now > 1800) {
    return false;
  }

  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes(binding.signature),
    context(binding)
  );
}

export async function readBrowserVerificationStatus(
  database, key, binding, now
) {
  if (!await verifyBrowserBinding(
    key, binding, now
  )) {
    return null;
  }

  const row = await database.prepare(`
    SELECT
      challenge.consumed_at AS consumedAt,
      receipt.verified_at AS verifiedAt,
      account.phone_verified_at AS phoneVerifiedAt
    FROM subscriber_verification_challenge AS challenge
    JOIN subscriber AS account
      ON account.id = challenge.subscriber_id
    LEFT JOIN subscriber_registration_contact_receipt AS receipt
      ON receipt.challenge_id = challenge.id
      AND receipt.subscriber_id = account.id
      AND receipt.channel = 'whatsapp'
    WHERE challenge.id = ?1
      AND challenge.subscriber_id = ?2
      AND challenge.purpose = 'registration'
      AND challenge.channel = 'whatsapp'
      AND challenge.created_at <= ?3
      AND challenge.expires_at > ?3
      AND account.state = 'incomplete'
  `).bind(
    binding.challengeId,
    binding.subscriberId,
    now
  ).first();

  if (!row) return null;

  return {
    verified:
      Number.isSafeInteger(row.consumedAt) &&
      row.consumedAt <= now &&
      row.verifiedAt === row.consumedAt &&
      Number.isSafeInteger(row.phoneVerifiedAt) &&
      row.phoneVerifiedAt <= now
  };
}
