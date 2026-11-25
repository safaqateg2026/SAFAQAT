import { readWhatsAppEvents } from "./whatsapp.mjs";
import { consumeVerifiedEvent } from "../verification.mjs";

export function createWhatsAppRegistrationHandler({
  database,
  key,
  config,
  clock = () => Math.floor(Date.now() / 1000)
}) {
  if (!database || !key || !config ||
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
      if (event.purpose !== "registration") continue;

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
