import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloud/worker.mjs";

const origin = "https://testing.safaqat.invalid";

test("registration fails closed when provider settings are missing", async () => {
  const response = await worker.fetch(
    new Request(`${origin}/api/registration/start`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phone: "+201000000001" })
    }),
    {
      APP_ORIGIN: origin,
      ACCOUNTS_ENABLED: "true",
      PENDING_REGISTRATION_ENABLED: "true",
      WHATSAPP_WEBHOOK_ENABLED: "true",
      DB: {},
      AUTH_HMAC_SECRET: "x".repeat(32),
      WHATSAPP_BUSINESS_PHONE: "201000000009"
    }
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "registration_disabled"
  });
});
