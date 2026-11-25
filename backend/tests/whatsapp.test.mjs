import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  createWhatsAppLink,
  parseVerificationMessage,
  readWhatsAppEvents
} from "../providers/whatsapp.mjs";

const id = "12345678-1234-1234-1234-123456789abc";
const proof = "a".repeat(64);

const config = {
  appSecret: "synthetic-whatsapp-secret-for-testing-only",
  businessAccountId: "100001",
  phoneNumberId: "100002"
};

function message() {
  return {
    id: "wamid.synthetic123",
    from: "201000000001",
    type: "text",
    text: {
      body: `SAFAQAT registration ${id} ${proof}`
    }
  };
}

function payload(messages = [message()]) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: config.businessAccountId,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            phone_number_id: config.phoneNumberId
          },
          messages
        }
      }]
    }]
  };
}

function request(value, valid = true) {
  const body = JSON.stringify(value);

  const signature = createHmac(
    "sha256", config.appSecret
  ).update(body).digest("hex");

  return new Request(
    "https://example.test/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256":
          "sha256=" + (valid
            ? signature
            : "0".repeat(64))
      },
      body
    }
  );
}

test("WhatsApp link contains the expected challenge", () => {
  const url = new URL(createWhatsAppLink({
    businessPhone: "201000000002",
    id, proof,
    purpose: "registration"
  }));

  assert.equal(url.hostname, "wa.me");
  assert.equal(url.pathname, "/201000000002");
  assert.equal(
    url.searchParams.get("text"),
    `SAFAQAT registration ${id} ${proof}`
  );
});

test("invalid destination phone rejected", () => {
  assert.throws(() => createWhatsAppLink({
    businessPhone: "invalid",
    id, proof,
    purpose: "registration"
  }));
});

test("invalid purpose rejected", () => {
  assert.throws(() => createWhatsAppLink({
    businessPhone: "201000000002",
    id, proof,
    purpose: "admin"
  }));
});

test("sender comes from provider metadata", () => {
  const event = parseVerificationMessage(message());

  assert.equal(event.sender, "+201000000001");
  assert.equal(event.id, id);
  assert.equal(event.proof, proof);
});

test("invalid sender rejected", () => {
  const value = message();
  value.from = "invalid";

  assert.equal(
    parseVerificationMessage(value), null
  );
});

test("invalid challenge rejected", () => {
  const value = message();
  value.text.body = "SAFAQAT registration fake fake";

  assert.equal(
    parseVerificationMessage(value), null
  );
});

test("non-text message ignored", () => {
  const value = message();
  value.type = "image";

  assert.equal(
    parseVerificationMessage(value), null
  );
});

test("signed matching account event accepted", async () => {
  const events = await readWhatsAppEvents(
    request(payload()), config
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].sender, "+201000000001");
});

test("forged signature rejected", async () => {
  assert.equal(await readWhatsAppEvents(
    request(payload(), false), config
  ), null);
});

test("wrong business account ignored", async () => {
  const value = payload();
  value.entry[0].id = "999999";

  assert.deepEqual(await readWhatsAppEvents(
    request(value), config
  ), []);
});

test("wrong destination number ignored", async () => {
  const value = payload();

  value.entry[0].changes[0].value
    .metadata.phone_number_id = "999999";

  assert.deepEqual(await readWhatsAppEvents(
    request(value), config
  ), []);
});

test("duplicate messages within one delivery ignored", async () => {
  const events = await readWhatsAppEvents(
    request(payload([message(), message()])),
    config
  );

  assert.equal(events.length, 1);
});

test("missing account configuration fails closed", async () => {
  assert.equal(await readWhatsAppEvents(
    request(payload()), {}
  ), null);
});

test("status notification does not verify an account", async () => {
  const value = payload();

  delete value.entry[0].changes[0].value.messages;

  value.entry[0].changes[0].value.statuses = [
    { status: "delivered" }
  ];

  assert.deepEqual(await readWhatsAppEvents(
    request(value), config
  ), []);
});

test("oversized event batches rejected", async () => {
  const value = payload();

  value.entry = Array.from(
    { length: 51 },
    () => value.entry[0]
  );

  assert.equal(await readWhatsAppEvents(
    request(value), config
  ), null);
});

test("login and recovery purposes preserved", () => {
  for (const purpose of ["login", "recovery"]) {
    const value = message();

    value.text.body =
      `SAFAQAT ${purpose} ${id} ${proof}`;

    assert.equal(
      parseVerificationMessage(value).purpose,
      purpose
    );
  }
});
