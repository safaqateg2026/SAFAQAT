import { readWhatsAppEvents } from "./whatsapp.mjs";
import { reserveAuthAttempt } from "../authRateLimit.mjs";
import {
  verifyPendingRegistration
} from "../pendingRegistration.mjs";

const encoder = new TextEncoder();

async function senderDigest(key, sender) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(JSON.stringify([
      "pending-whatsapp-rate-v1",
      sender
    ]))
  );

  return Array.from(
    new Uint8Array(signature),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

export function createPendingWhatsAppHandler({
  database,
  key,
  config,
  clock = () => Math.floor(Date.now() / 1000)
}) {
  if (!database ||
      !key ||
      !config ||
      typeof clock !== "function") {
    throw new TypeError("trusted configuration required");
  }

  return async function handle(request) {
    const events = await readWhatsAppEvents(
      request, config
    );

    if (events === null) return null;

    const now = clock();

    if (!Number.isSafeInteger(now) || now < 0) {
      throw new TypeError("invalid server clock");
    }

    let accepted = 0;

    for (const event of events) {
      if (event.purpose !== "registration") {
        continue;
      }

      const allowed = await reserveAuthAttempt(
        database,
        {
          action: "challenge_verify",
          subjectDigest: await senderDigest(
            key, event.sender
          ),
          now,
          windowSeconds: 300,
          limit: 20
        }
      );

      if (!allowed) continue;

      if (await verifyPendingRegistration(
        database, key, event, now
      )) {
        accepted++;
      }
    }

    return { accepted };
  };
}
