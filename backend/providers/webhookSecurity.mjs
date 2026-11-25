const encoder = new TextEncoder();

export async function verifyProviderSignature(
  body,
  signature,
  secret
) {
  if (!(body instanceof Uint8Array) ||
      body.byteLength === 0 ||
      body.byteLength > 262144 ||
      typeof secret !== "string" ||
      secret.length < 32 ||
      typeof signature !== "string" ||
      !/^sha256=[a-f0-9]{64}$/.test(signature)) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const supplied = Uint8Array.from(
    signature.slice(7).match(/.{2}/g),
    pair => Number.parseInt(pair, 16)
  );

  return crypto.subtle.verify(
    "HMAC", key, supplied, body
  );
}

export async function readBoundedBody(
  request,
  maximum = 262144
) {
  if (!Number.isSafeInteger(maximum) ||
      maximum < 1 ||
      maximum > 262144) {
    throw new TypeError("invalid body limit");
  }

  const length = request.headers.get("Content-Length");

  if (length !== null &&
      (!/^[0-9]+$/.test(length) ||
       Number(length) > maximum)) {
    return null;
  }

  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.byteLength;

      if (size > maximum) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (size === 0) return null;

  const result = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export async function authenticateWebhook(
  request,
  secret
) {
  if (request.method !== "POST") return null;

  const contentType =
    request.headers.get("Content-Type") ?? "";

  if (contentType.split(";")[0].trim().toLowerCase()
      !== "application/json") {
    return null;
  }

  const body = await readBoundedBody(request);

  if (!body || !await verifyProviderSignature(
    body,
    request.headers.get("X-Hub-Signature-256"),
    secret
  )) {
    return null;
  }

  try {
    const payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(body)
    );

    return payload &&
      typeof payload === "object" &&
      !Array.isArray(payload)
      ? payload : null;
  } catch {
    return null;
  }
}
