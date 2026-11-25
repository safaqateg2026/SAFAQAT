import {
  authenticateWebhook
} from "./webhookSecurity.mjs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const proofPattern = /^[0-9a-f]{64}$/;
const phonePattern = /^201[0-9]{9}$/;
const accountPattern = /^[0-9]{1,32}$/;

const purposes = new Set([
  "registration",
  "login",
  "recovery"
]);

export function createWhatsAppLink({
  businessPhone,
  id,
  proof,
  purpose
}) {
  if (!phonePattern.test(businessPhone) ||
      !uuidPattern.test(id) ||
      !proofPattern.test(proof) ||
      !purposes.has(purpose)) {
    throw new TypeError("invalid verification link");
  }

  const url = new URL(
    `https://wa.me/${businessPhone}`
  );

  url.searchParams.set(
    "text",
    `SAFAQAT ${purpose} ${id} ${proof}`
  );

  return url.toString();
}

export function parseVerificationMessage(message) {
  if (message?.type !== "text" ||
      typeof message.from !== "string" ||
      !phonePattern.test(message.from) ||
      typeof message.id !== "string" ||
      !/^wamid\.[A-Za-z0-9_+/=-]{1,500}$/.test(message.id) ||
      typeof message.text?.body !== "string" ||
      message.text.body.length > 256) {
    return null;
  }

  const match = /^SAFAQAT (registration|login|recovery) ([0-9a-f-]{36}) ([0-9a-f]{64})$/
    .exec(message.text.body.trim());

  if (!match || !uuidPattern.test(match[2])) {
    return null;
  }

  return {
    messageId: message.id,
    sender: `+${message.from}`,
    purpose: match[1],
    id: match[2],
    proof: match[3]
  };
}

export async function readWhatsAppEvents(
  request,
  {
    appSecret,
    businessAccountId,
    phoneNumberId
  } = {}
) {
  if (typeof businessAccountId !== "string" ||
      typeof phoneNumberId !== "string" ||
      !accountPattern.test(businessAccountId) ||
      !accountPattern.test(phoneNumberId)) {
    return null;
  }

  const payload = await authenticateWebhook(
    request,
    appSecret
  );

  if (!payload ||
      payload.object !== "whatsapp_business_account" ||
      !Array.isArray(payload.entry) ||
      payload.entry.length > 50) {
    return null;
  }

  const events = [];
  const seen = new Set();
  let inspected = 0;

  for (const entry of payload.entry) {
    if (entry?.id !== businessAccountId ||
        !Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (++inspected > 200) return null;

      const value = change?.value;

      if (change?.field !== "messages" ||
          value?.messaging_product !== "whatsapp" ||
          value?.metadata?.phone_number_id !== phoneNumberId ||
          !Array.isArray(value.messages)) {
        continue;
      }

      for (const message of value.messages) {
        if (++inspected > 200) return null;

        const event = parseVerificationMessage(message);

        if (!event || seen.has(event.messageId)) {
          continue;
        }

        seen.add(event.messageId);
        events.push(event);

        if (events.length > 50) return null;
      }
    }
  }

  return events;
}
