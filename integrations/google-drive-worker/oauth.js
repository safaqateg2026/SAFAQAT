const REDIRECT_URI =
  "https://safaqat-drive-admin.safaqat-eg2026.workers.dev/oauth/callback";

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createGoogleAuthUrl(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.OAUTH_STATE_SECRET) {
    throw new Error("Missing OAuth configuration");
  }

  const nonce = crypto.randomUUID();
  const expires = Date.now() + 5 * 60 * 1000;
  const payload = `${nonce}.${expires}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.OAUTH_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const state = `${payload}.${toBase64Url(new Uint8Array(signature))}`;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state };
}
