import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrowserBinding,
  verifyBrowserBinding,
  readBrowserVerificationStatus
} from "../browserVerification.mjs";

const key = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

const otherKey = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

const input = {
  challengeId: "12345678-1234-1234-1234-123456789abc",
  subscriberId: "87654321-4321-4321-4321-abcdef123456",
  now: 100,
  expiresAt: 400
};

async function issue() {
  return createBrowserBinding(key, input);
}

test("valid browser binding is authenticated", async () => {
  assert.equal(
    await verifyBrowserBinding(key, await issue(), 101),
    true
  );
});

test("browser secrets are independently randomized", async () => {
  const first = await issue();
  const second = await issue();

  assert.notEqual(
    first.browserSecret,
    second.browserSecret
  );

  assert.notEqual(
    first.signature,
    second.signature
  );
});

test("modified browser secret is rejected", async () => {
  const binding = await issue();

  binding.browserSecret = "0".repeat(64);

  assert.equal(
    await verifyBrowserBinding(key, binding, 101),
    false
  );
});

test("modified subscriber ID is rejected", async () => {
  const binding = await issue();

  binding.subscriberId = crypto.randomUUID();

  assert.equal(
    await verifyBrowserBinding(key, binding, 101),
    false
  );
});

test("modified challenge ID is rejected", async () => {
  const binding = await issue();

  binding.challengeId = crypto.randomUUID();

  assert.equal(
    await verifyBrowserBinding(key, binding, 101),
    false
  );
});

test("modified expiry is rejected", async () => {
  const binding = await issue();

  binding.expiresAt += 100;

  assert.equal(
    await verifyBrowserBinding(key, binding, 101),
    false
  );
});

test("expired browser binding is rejected", async () => {
  assert.equal(
    await verifyBrowserBinding(key, await issue(), 400),
    false
  );
});

test("different signing key is rejected", async () => {
  assert.equal(
    await verifyBrowserBinding(otherKey, await issue(), 101),
    false
  );
});

test("invalid binding cannot query the database", async () => {
  const database = {
    prepare() {
      throw new Error("database must not be accessed");
    }
  };

  assert.equal(
    await readBrowserVerificationStatus(
      database, key, null, 101
    ),
    null
  );
});

test("excessive binding lifetime is rejected", async () => {
  await assert.rejects(
    createBrowserBinding(key, {
      ...input,
      expiresAt: 10000
    }),
    TypeError
  );
});
