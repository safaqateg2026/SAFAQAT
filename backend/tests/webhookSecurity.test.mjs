import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  verifyProviderSignature,
  readBoundedBody,
  authenticateWebhook
} from "../providers/webhookSecurity.mjs";

const secret = "synthetic-test-secret-not-a-real-credential";
const encoder = new TextEncoder();
const body = '{"object":"whatsapp_business_account"}';

function sign(value) {
  return "sha256=" + createHmac("sha256", secret)
    .update(value).digest("hex");
}

function request(value, signature, options = {}) {
  return new Request(
    "https://example.test/webhook",
    {
      method: "POST",
      body: value,
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature
      },
      ...options
    }
  );
}

test("valid provider signature", async () => {
  assert.equal(await verifyProviderSignature(
    encoder.encode(body), sign(body), secret
  ), true);
});

test("modified provider payload rejected", async () => {
  assert.equal(await verifyProviderSignature(
    encoder.encode(body + " "), sign(body), secret
  ), false);
});

test("invalid signature rejected", async () => {
  assert.equal(await verifyProviderSignature(
    encoder.encode(body), "sha256=" + "0".repeat(64), secret
  ), false);
});

test("missing signature rejected", async () => {
  assert.equal(await verifyProviderSignature(
    encoder.encode(body), null, secret
  ), false);
});

test("missing secret fails closed", async () => {
  assert.equal(await verifyProviderSignature(
    encoder.encode(body), sign(body), undefined
  ), false);
});

test("short secret rejected", async () => {
  assert.equal(await verifyProviderSignature(
    encoder.encode(body), sign(body), "short"
  ), false);
});

test("oversized body rejected", async () => {
  const value = "x".repeat(262145);
  assert.equal(await readBoundedBody(
    request(value, sign(value))
  ), null);
});

test("stream size limit enforced", async () => {
  assert.equal(await readBoundedBody(
    request(body, sign(body)), 8
  ), null);
});

test("authenticated JSON accepted", async () => {
  assert.deepEqual(await authenticateWebhook(
    request(body, sign(body)), secret
  ), JSON.parse(body));
});

test("malformed JSON rejected despite valid signature", async () => {
  const value = "{invalid";
  assert.equal(await authenticateWebhook(
    request(value, sign(value)), secret
  ), null);
});

test("array payload rejected", async () => {
  const value = "[]";
  assert.equal(await authenticateWebhook(
    request(value, sign(value)), secret
  ), null);
});

test("unsigned request rejected", async () => {
  assert.equal(await authenticateWebhook(
    request(body, ""), secret
  ), null);
});

test("GET request cannot submit a provider event", async () => {
  assert.equal(await authenticateWebhook(
    new Request("https://example.test/webhook"),
    secret
  ), null);
});

test("unsupported content type rejected", async () => {
  assert.equal(await authenticateWebhook(
    request(body, sign(body), {
      headers: {
        "Content-Type": "text/plain",
        "X-Hub-Signature-256": sign(body)
      }
    }), secret
  ), null);
});
