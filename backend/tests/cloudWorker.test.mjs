import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloud/worker.mjs";

const base = "https://safaqat.example.test";

const env = {
  APP_ORIGIN: base,
  ACCOUNTS_ENABLED: "false"
};

const request = (path, options) =>
  new Request(base + path, options);

test("worker rejects missing origin configuration", async () => {
  const response = await worker.fetch(
    request("/api/health"), {}
  );
  assert.equal(response.status, 403);
});

test("worker rejects untrusted hosts", async () => {
  const response = await worker.fetch(
    new Request("https://other.example.test/api/health"), env
  );
  assert.equal(response.status, 403);
});

test("worker rejects insecure transport", async () => {
  const response = await worker.fetch(
    new Request("http://safaqat.example.test/api/health"), env
  );
  assert.equal(response.status, 403);
});

test("worker rejects cross-origin requests", async () => {
  const response = await worker.fetch(
    request("/api/health", {
      headers: { Origin: "https://other.example.test" }
    }), env
  );
  assert.equal(response.status, 403);
});

test("health response exposes no private information", async () => {
  const response = await worker.fetch(
    request("/api/health"), env
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("health endpoint rejects write requests", async () => {
  const response = await worker.fetch(
    request("/api/health", { method: "POST" }), env
  );
  assert.equal(response.status, 405);
});

test("administration remains disabled despite spoofed headers", async () => {
  const response = await worker.fetch(
    request("/api/admin/subscribers", {
      headers: {
        "X-Admin": "true",
        "X-MFA-Verified": "true"
      }
    }), env
  );
  assert.equal(response.status, 503);
});

test("account endpoints remain disabled by default", async () => {
  for (const path of [
    "/api/account/session",
    "/api/account/invoices",
    "/api/account/archive/example"
  ]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 503);
  }
});

test("missing storage bindings fail closed", async () => {
  const response = await worker.fetch(
    request("/api/account/session"),
    { ...env, ACCOUNTS_ENABLED: "true" }
  );
  assert.equal(response.status, 503);
});

test("unknown endpoints are rejected", async () => {
  const response = await worker.fetch(
    request("/api/unknown"), env
  );
  assert.equal(response.status, 404);
});
