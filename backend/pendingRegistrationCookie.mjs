const name = "__Host-safaqat_registration";

const attributes =
  "Path=/; Secure; HttpOnly; SameSite=Strict";

const pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/;

export function writePendingRegistrationCookie(
  pending, now
) {
  const value =
    `${pending?.id}.${pending?.browserSecret}`;

  const age = pending?.expiresAt - now;

  if (!pattern.test(value) ||
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !Number.isSafeInteger(age) ||
      age < 1 ||
      age > 1800) {
    throw new TypeError("invalid registration cookie");
  }

  return `${name}=${value}; ${attributes}; Max-Age=${age}`;
}

export function readPendingRegistrationCookie(header) {
  if (typeof header !== "string" ||
      header.length > 8192) return null;

  const entries = header.split(";")
    .map(value => value.trim())
    .filter(value => value.startsWith(name + "="));

  if (entries.length !== 1) return null;

  const value = entries[0].slice(name.length + 1);

  if (!pattern.test(value)) return null;

  const [id, browserSecret] = value.split(".");

  return { id, browserSecret };
}

export function clearPendingRegistrationCookie() {
  return `${name}=; ${attributes}; Max-Age=0`;
}
