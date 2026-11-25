import test from "node:test";
import assert from "node:assert/strict";

import worker from "../cloud/worker.mjs";
import {
  handleWhatsAppRoute
} from "../providers/whatsappRoute.mjs";

const origin = "https://example.test";
const endpoint = origin + "/api/webhooks/whatsapp";

const env = {
  APP_ORIGIN: origin,
  WHATSAPP_WEBHOOK_ENABLED: "true",
  WHATSAPP_VERIFY_TOKEN:
    "synthetic-webhook-verification-token"
};

function handshake(token = env.WHATSAPP_VERIFY_TOKEN) {
  const url = new URL(endpoint);

  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", token);
  url.searchParams.set("hub.challenge", "123456");

  return url;
}

test("webhook is disabled by default", async () => {
  const result = await worker.fetch(
    new Request(handshake()),
    { APP_ORIGIN: origin }
  );

  assert.equal(result.status, 503);
});

test("valid webhook handshake succeeds", async () => {
  const result = await worker.fetch(
    new Request(handshake()), env
  );

  assert.equal(result.status, 200);
  assert.equal(await result.text(), "123456");
  assert.equal(
    result.headers.get("Cache-Control"),
    "private, no-store"
  );
});

test("incorrect verification token rejected", async () => {
  const result = await worker.fetch(
    new Request(handshake("wrong-token")), env
  );

  assert.equal(result.status, 403);
});

test("duplicate handshake parameters rejected", async () => {
  const url = handshake();

  url.searchParams.append(
    "hub.verify_token", env.WHATSAPP_VERIFY_TOKEN
  );

  const result = await worker.fetch(
    new Request(url), env
  );

  assert.equal(result.status, 400);
});

test("missing verification secret fails closed", async () => {
  const result = await worker.fetch(
    new Request(handshake()),
    { ...env, WHATSAPP_VERIFY_TOKEN: undefined }
  );

  assert.equal(result.status, 503);
});

test("POST remains disabled without account activation", async () => {
  const result = await worker.fetch(
    new Request(endpoint, {
      method: "POST",
      body: "{}"
    }),
    env
  );

  assert.equal(result.status, 503);
});

test("missing provider bindings fail closed", async () => {
  const result = await worker.fetch(
    new Request(endpoint, {
      method: "POST",
      body: "{}"
    }),
    { ...env, ACCOUNTS_ENABLED: "true" }
  );

  assert.equal(result.status, 503);
});

test("unsupported webhook methods rejected", async () => {
  const result = await worker.fetch(
    new Request(endpoint, { method: "PUT" }),
    env
  );

  assert.equal(result.status, 405);
});

test("untrusted webhook origin rejected", async () => {
  const result = await handleWhatsAppRoute(
    new Request(
      "https://other.test/api/webhooks/whatsapp"
    ),
    env
  );

  assert.equal(result.status, 403);
});

test("insecure webhook transport rejected", async () => {
  const result = await handleWhatsAppRoute(
    new Request(
      "http://example.test/api/webhooks/whatsapp"
    ),
    env
  );

  assert.equal(result.status, 403);
});
