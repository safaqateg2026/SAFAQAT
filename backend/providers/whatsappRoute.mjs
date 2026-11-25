import {
  createPendingWhatsAppHandler
} from "./pendingWhatsApp.mjs";

import {
  createWhatsAppRegistrationHandler
} from "./whatsappRegistration.mjs";

function response(status, body = "") {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'"
    }
  });
}

function validSecret(value) {
  return typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 512;
}

async function equalSecrets(first, second) {
  if (typeof first !== "string" ||
      first.length > 512) return false;

  const encoder = new TextEncoder();

  const a = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256", encoder.encode(first)
    )
  );

  const b = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256", encoder.encode(second)
    )
  );

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }

  return difference === 0;
}

export async function handleWhatsAppRoute(request, env) {
  try {
    if (env.WHATSAPP_WEBHOOK_ENABLED !== "true") {
      return response(503, "Service unavailable");
    }

    const url = new URL(request.url);

    if (url.protocol !== "https:" ||
        url.origin !== env.APP_ORIGIN ||
        url.pathname !== "/api/webhooks/whatsapp") {
      return response(403, "Forbidden");
    }

    if (!validSecret(env.WHATSAPP_VERIFY_TOKEN)) {
      return response(503, "Service unavailable");
    }

    if (request.method === "GET") {
      const params = url.searchParams;

      for (const name of [
        "hub.mode",
        "hub.verify_token",
        "hub.challenge"
      ]) {
        if (params.getAll(name).length !== 1) {
          return response(400, "Invalid request");
        }
      }

      const challenge = params.get("hub.challenge");

      if (params.get("hub.mode") !== "subscribe" ||
          !/^[0-9]{1,128}$/.test(challenge) ||
          !await equalSecrets(
            params.get("hub.verify_token"),
            env.WHATSAPP_VERIFY_TOKEN
          )) {
        return response(403, "Forbidden");
      }

      return response(200, challenge);
    }

    if (request.method !== "POST") {
      return response(405, "Method not allowed");
    }

    if (env.ACCOUNTS_ENABLED !== "true" ||
        !env.DB ||
        !validSecret(env.WHATSAPP_APP_SECRET) ||
        !validSecret(env.AUTH_HMAC_SECRET) ||
        !/^[0-9]{1,32}$/.test(
          env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? ""
        ) ||
        !/^[0-9]{1,32}$/.test(
          env.WHATSAPP_PHONE_NUMBER_ID ?? ""
        )) {
      return response(503, "Service unavailable");
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.AUTH_HMAC_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const createHandler =
      env.PENDING_REGISTRATION_ENABLED === "true"
        ? createPendingWhatsAppHandler
        : createWhatsAppRegistrationHandler;

    const handler = createHandler({
      database: env.DB,
      key,
      config: {
        appSecret: env.WHATSAPP_APP_SECRET,
        businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID
      }
    });

    const result = await handler(request);

    if (result === null) {
      return response(403, "Forbidden");
    }

    return response(200, "OK");
  } catch {
    return response(503, "Service unavailable");
  }
}
