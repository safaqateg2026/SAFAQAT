import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  onRequest
} from "../../app/functions/api/[[path]].js";

const origin = "https://safaqat-59e.pages.dev";

const env = {
  APP_ORIGIN: origin,
  ACCOUNTS_ENABLED: "false",
  PENDING_REGISTRATION_ENABLED: "false",
  WHATSAPP_WEBHOOK_ENABLED: "false"
};

async function call(path, options = {}) {
  return onRequest({
    request: new Request(`${origin}${path}`, options),
    env
  });
}

test("Pages bridge forwards API health requests", async () => {
  const response = await call("/api/health");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok"
  });

  assert.match(
    response.headers.get("Cache-Control"),
    /no-store/
  );
});

test("Pages bridge preserves disabled registration", async () => {
  const response = await call(
    "/api/registration/start",
    {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: "+201000000001"
      })
    }
  );

  assert.equal(response.status, 503);
});

test("Pages bridge preserves disabled accounts", async () => {
  const response = await call("/api/account/profile");

  assert.equal(response.status, 503);
});

test("Pages bridge preserves disabled administration", async () => {
  const response = await call("/api/admin/subscribers");

  assert.equal(response.status, 503);
});

test("Pages bridge preserves disabled WhatsApp webhook", async () => {
  const response = await call("/api/webhooks/whatsapp");

  assert.ok(response.status >= 400);
});

test("Pages bridge rejects cross-origin requests", async () => {
  const response = await call("/api/health", {
    headers: {
      Origin: "https://untrusted.invalid"
    }
  });

  assert.equal(response.status, 403);
});

test("Pages bridge rejects unknown API endpoints", async () => {
  const response = await call("/api/unknown");

  assert.equal(response.status, 404);
});

test("Pages functions do not intercept application assets", () => {
  const routes = JSON.parse(readFileSync(
    new URL(
      "../../app/public/_routes.json",
      import.meta.url
    ),
    "utf8"
  ));

  assert.deepEqual(routes.include, ["/api/*"]);
  assert.deepEqual(routes.exclude, []);
});
