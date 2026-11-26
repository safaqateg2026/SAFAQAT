import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloud/worker.mjs";

const origin = "https://safaqat.example";

const env = {
  APP_ORIGIN: origin,
  ACCOUNTS_ENABLED: "false",
  DELIVERY_ENABLED: "false",
  PENDING_REGISTRATION_ENABLED: "true",
  WHATSAPP_WEBHOOK_ENABLED: "true",
  WHATSAPP_APP_SECRET: "a".repeat(32),
  WHATSAPP_VERIFY_TOKEN: "b".repeat(32),
  AUTH_HMAC_SECRET: "c".repeat(32),
  WHATSAPP_BUSINESS_ACCOUNT_ID: "123456",
  WHATSAPP_PHONE_NUMBER_ID: "654321",
  WHATSAPP_BUSINESS_PHONE: "201000000001",
  DB: {}
};

test("account API remains disabled during phone verification", async () => {
  const response = await worker.fetch(
    new Request(origin + "/api/account/me"),
    env
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "accounts_disabled");
});

test("delivery API remains disabled during phone verification", async () => {
  const response = await worker.fetch(
    new Request(origin + "/api/delivery/history"),
    env
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "delivery_disabled");
});

test("admin API remains disabled during phone verification", async () => {
  const response = await worker.fetch(
    new Request(origin + "/api/admin/accounts"),
    env
  );
  assert.equal(response.status, 503);
});

test("phone verification route is independent of account activation", async () => {
  const response = await worker.fetch(
    new Request(origin + "/api/registration/start"),
    env
  );
  assert.equal(response.status, 403);
});

test("disabled phone verification fails closed", async () => {
  const response = await worker.fetch(
    new Request(origin + "/api/registration/start"),
    {
      ...env,
      PENDING_REGISTRATION_ENABLED: "false"
    }
  );
  assert.equal(response.status, 503);
});

test("unsigned webhook remains forbidden", async () => {
  const response = await worker.fetch(
    new Request(origin + "/api/webhooks/whatsapp", {
      method: "POST",
      body: "{}"
    }),
    env
  );
  assert.equal(response.status, 403);
});
