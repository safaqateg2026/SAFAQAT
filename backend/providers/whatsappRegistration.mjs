import { reserveAuthAttempt } from "../authRateLimit.mjs";
import { readWhatsAppEvents } from "./whatsapp.mjs";
import { consumeVerifiedEvent } from "../verification.mjs";

export function createWhatsAppRegistrationHandler({
  database,
  key,
  config,
  rateLimit = { windowSeconds: 60, limit: 20 },
  clock = () => Math.floor(Date.now() / 1000)
}) {
  if (!database || !key || !config ||
      typeof clock !== "function") {
    throw new TypeError("trusted configuration required");
  }

  if (!Number.isSafeInteger(rateLimit.windowSeconds) ||
      rateLimit.windowSeconds < 1 ||
      !Number.isSafeInteger(rateLimit.limit) ||
      rateLimit.limit < 1) {
    throw new TypeError("invalid provider rate limit");
  }

  async function reserveSender(sender, now) {
    const input = new TextEncoder().encode(
      JSON.stringify(["whatsapp-registration-rate", sender])
    );

    const digest = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, input)
    );

    const subjectDigest = Array.from(
      digest, byte => byte.toString(16).padStart(2, "0")
    ).join("");

    return reserveAuthAttempt(database, {
      action: "challenge_verify",
      subjectDigest,
      now,
      windowSeconds: rateLimit.windowSeconds,
      limit: rateLimit.limit
    });
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
      if (event.purpose !== "registration") continue;

      if (!await reserveSender(event.sender, now)) {
        continue;
      }

      const result = await consumeVerifiedEvent(
        database,
        key,
        {
          id: event.id,
          purpose: "registration",
          channel: "whatsapp",
          sender: event.sender,
          proof: event.proof
        },
        now
      );

      if (result) accepted++;
    }

    return { accepted };
  };
}
