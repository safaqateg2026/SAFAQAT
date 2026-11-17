const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REDIRECT_URI = "https://safaqat-drive-admin.safaqat-eg2026.workers.dev/oauth/callback";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function encryptionKey(env) {
  const hex = env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(hex || "")) {
    throw new Error("Invalid encryption key");
  }
  const bytes = Uint8Array.from(
    hex.match(/.{2}/g),
    value => parseInt(value, 16)
  );
  return crypto.subtle.importKey(
    "raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]
  );
}

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function decode(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

export async function encryptRefreshToken(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    encoder.encode(token)
  );
  return JSON.stringify({
    v: 1,
    iv: encode(iv),
    data: encode(new Uint8Array(ciphertext))
  });
}

export async function decryptRefreshToken(env, payload) {
  const record = JSON.parse(payload);
  if (record.v !== 1) throw new Error("Unsupported token format");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(record.iv) },
    await encryptionKey(env),
    decode(record.data)
  );
  return decoder.decode(plaintext);
}

async function requestToken(env, fields) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing Google OAuth credentials");
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      ...fields
    })
  });
  if (!response.ok) {
    throw new Error(`Google token request failed (${response.status})`);
  }
  const result = await response.json();
  if (!result.access_token) {
    throw new Error("No access token returned");
  }
  return result;
}

export function exchangeAuthorizationCode(env, code) {
  return requestToken(env, {
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI
  });
}

export async function getDriveAccessToken(env) {
  const encrypted = await env.SAFAQAT_DRIVE_AUTH.get("google:refresh-token");
  if (!encrypted) throw new Error("Google Drive is not connected");

  const refreshToken = await decryptRefreshToken(env, encrypted);
  const result = await requestToken(env, {
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  return result.access_token;
}

export async function verifyDriveConnection(accessToken) {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new Error(`Drive API verification failed (${response.status})`);
  }
  const result = await response.json();
  return result.user?.emailAddress || null;
}
