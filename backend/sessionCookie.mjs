const cookieName = "__Host-safaqat_session";
const cookieAttributes = "Path=/; Secure; HttpOnly; SameSite=Lax";

export function writeSessionCookie(session, now) {
  if (!/^[0-9a-f]{64}$/.test(session?.token)
    || !Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(session.expiresAt)
    || session.expiresAt <= now) throw new TypeError("invalid session cookie");
  return `${cookieName}=${session.token}; ${cookieAttributes}; Max-Age=${session.expiresAt - now}`;
}

export function clearSessionCookie() {
  return `${cookieName}=; ${cookieAttributes}; Max-Age=0`;
}

export function readSessionCookie(cookieHeader) {
  const entries = (cookieHeader ?? "").split(";").map(entry => entry.trim())
    .filter(entry => entry.startsWith(cookieName + "="));
  const token = entries.length === 1 ? entries[0].slice(cookieName.length + 1) : "";
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}
