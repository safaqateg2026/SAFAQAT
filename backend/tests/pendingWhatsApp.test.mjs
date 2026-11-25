import test from "node:test";
import assert from "node:assert/strict";

import { databaseForTest } from "./sqliteAdapter.mjs";

import {
  createPendingRegistration,
  readPendingRegistration
} from "../pendingRegistration.mjs";

import {
  createPendingWhatsAppHandler
} from "../providers/pendingWhatsApp.mjs";

const key = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"]
);

const config = {
  appSecret: "synthetic-secret-for-testing-only-12345",
  businessAccountId: "100001",
  phoneNumberId: "200001"
};

const phone = "+201000000001";

async function setup(t) {
  const { database, sql } = databaseForTest(t);

  const pending = await createPendingRegistration(
    database, key, {
      phone,
      rateSubject: "synthetic-source",
      now: 100,
      expiresAt: 400
    }
  );

  assert.ok(pending);

  const handler = createPendingWhatsAppHandler({
    database,
    key,
    config,
    clock: () => 105
  });

  return { database, sql, pending, handler };
}

async function request(pending, options = {}) {
  const {
    sender = phone.slice(1),
    proof = pending.proof,
    purpose = "registration",
    destination = config.phoneNumberId,
    account = config.businessAccountId,
    secret = config.appSecret,
    messageId = "wamid.synthetic123"
  } = options;

  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: account,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            phone_number_id: destination
          },
          messages: [{
            id: messageId,
            from: sender,
            type: "text",
            text: {
              body: `SAFAQAT ${purpose} ${pending.id} ${proof}`
            }
          }]
        }
      }]
    }]
  });

  const encoder = new TextEncoder();

  const signingKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC", signingKey, encoder.encode(body)
      )
    ),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");

  return new Request(
    "https://testing.safaqat.invalid/api/webhooks/whatsapp",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${signature}`
      },
      body
    }
  );
}

async function status(database, pending) {
  return readPendingRegistration(
    database, key, {
      id: pending.id,
      browserSecret: pending.browserSecret,
      phone
    },
    106
  );
}

test("signed WhatsApp event verifies a pending request without creating an account", async t => {
  const { database, sql, pending, handler } =
    await setup(t);

  assert.deepEqual(
    await status(database, pending),
    { verified: false }
  );

  assert.deepEqual(
    await handler(await request(pending)),
    { accepted: 1 }
  );

  assert.deepEqual(
    await status(database, pending),
    { verified: true }
  );

  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS n FROM subscriber"
    ).get().n,
    0
  );
});

test("forged provider signature cannot verify a pending request", async t => {
  const { database, pending, handler } =
    await setup(t);

  assert.equal(
    await handler(await request(pending, {
      secret: "incorrect-synthetic-secret-123456789"
    })),
    null
  );

  assert.deepEqual(
    await status(database, pending),
    { verified: false }
  );
});

test("wrong sender, proof, purpose and provider destination are rejected", async t => {
  const { database, pending, handler } =
    await setup(t);

  for (const options of [
    { sender: "201000000002" },
    { proof: "0".repeat(64) },
    { purpose: "login" },
    { purpose: "recovery" },
    { destination: "999999" },
    { account: "999999" }
  ]) {
    assert.deepEqual(
      await handler(await request(pending, options)),
      { accepted: 0 }
    );
  }

  assert.deepEqual(
    await status(database, pending),
    { verified: false }
  );
});

test("provider replay cannot verify the same pending request twice", async t => {
  const { pending, handler } = await setup(t);

  assert.deepEqual(
    await handler(await request(pending)),
    { accepted: 1 }
  );

  assert.deepEqual(
    await handler(await request(pending)),
    { accepted: 0 }
  );

  assert.deepEqual(
    await handler(await request(pending, {
      messageId: "wamid.synthetic456"
    })),
    { accepted: 0 }
  );
});

test("expired pending request cannot be verified by a signed provider event", async t => {
  const { database, pending } = await setup(t);

  const handler = createPendingWhatsAppHandler({
    database,
    key,
    config,
    clock: () => 400
  });

  assert.deepEqual(
    await handler(await request(pending)),
    { accepted: 0 }
  );
});

test("sender rate limit blocks excessive verification attempts", async t => {
  const { database, pending, handler } =
    await setup(t);

  for (let i = 0; i < 20; i++) {
    assert.deepEqual(
      await handler(await request(pending, {
        proof: "0".repeat(64),
        messageId: `wamid.synthetic${i}`
      })),
      { accepted: 0 }
    );
  }

  assert.deepEqual(
    await handler(await request(pending)),
    { accepted: 0 }
  );

  assert.deepEqual(
    await status(database, pending),
    { verified: false }
  );
});

test("another sender cannot exhaust the legitimate sender verification quota", async t => {
  const { database, pending, handler } =
    await setup(t);

  for (let i = 0; i < 21; i++) {
    assert.deepEqual(
      await handler(await request(pending, {
        sender: "201000000002",
        messageId: `wamid.synthetic${i}`
      })),
      { accepted: 0 }
    );
  }

  assert.deepEqual(
    await handler(await request(pending)),
    { accepted: 1 }
  );

  assert.deepEqual(
    await status(database, pending),
    { verified: true }
  );
});
