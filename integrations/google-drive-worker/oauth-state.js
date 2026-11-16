const encoder = new TextEncoder();

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function verifyOAuthState(state, secret) {
  if (!state || !secret) return false;

  const parts = state.split(".");
  if (parts.length !== 3) return false;

  const [nonce, expires, signature] = parts;
  const expiry = Number(expires);

  if (!nonce || !Number.isSafeInteger(expiry)) return false;
  if (Date.now() > expiry || expiry > Date.now() + 300000) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      encoder.encode(`${nonce}.${expires}`)
    );
  } catch {
    return false;
  }
}
