import test from "node:test";
import assert from "node:assert/strict";

import { databaseForTest } from "./sqliteAdapter.mjs";

import {
  createPendingRegistrationApi
} from "../pendingRegistrationApi.mjs";

import {
  verifyPendingRegistration
} from "../pendingRegistration.mjs";

import worker from "../cloud/worker.mjs";

const origin = "https://testing.safaqat.invalid";
const phone = "+201000000001";

const key = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"]
);

function setup(t) {
  const { database, sql } = databaseForTest(t);

  let now = 100;

  const handle = createPendingRegistrationApi({
    database,
    key,
    origin,
    businessPhone: "201000000009",
    trustedRateSubject: () => "synthetic-source",
    clock: () => now
  });

  return {
    database,
    sql,
    handle,
    setTime: value => { now = value; }
  };
}

function request(path, options = {}) {
  const {
    cookie,
    body = { phone },
    requestOrigin = origin,
    method = "POST"
  } = options;

  const headers = new Headers({
    "Origin": requestOrigin,
    "Content-Type": "application/json"
  });

  if (cookie) headers.set("Cookie", cookie);

  return new Request(origin + path, {
    method,
    headers,
    body: method === "GET"
      ? undefined
      : JSON.stringify(body)
  });
}

async function start(handle) {
  const result = await handle(
    request("/api/registration/start")
  );

  assert.equal(result.status, 200);

  const data = await result.json();

  const cookie = result.headers
    .get("Set-Cookie").split(";")[0];

  return { data, cookie };
}

test("registration starts without creating a subscriber", async t => {
  const { handle, sql } = setup(t);
  const { data } = await start(handle);

  assert.equal(data.verified, false);
  assert.equal(data.expiresAt, 1000);

  const link = new URL(data.whatsappUrl);

  assert.equal(link.origin, "https://wa.me");
  assert.equal(link.pathname, "/201000000009");

  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS n FROM subscriber"
    ).get().n,
    0
  );

  assert.equal(data.browserSecret, undefined);
});

test("authenticated provider proof updates the original browser status", async t => {
  const { handle, database } = setup(t);

  const { data, cookie } = await start(handle);

  const before = await handle(request(
    "/api/registration/status", { cookie }
  ));

  assert.deepEqual(
    await before.json(),
    { verified: false }
  );

  const message = new URL(data.whatsappUrl)
    .searchParams.get("text");

  const [, purpose, id, proof] = message.split(" ");

  assert.equal(
    await verifyPendingRegistration(
      database, key,
      { purpose, id, proof, sender: phone },
      100
    ),
    true
  );

  const after = await handle(request(
    "/api/registration/status", { cookie }
  ));

  assert.deepEqual(
    await after.json(),
    { verified: true }
  );
});

test("registration status requires the original browser cookie", async t => {
  const { handle } = setup(t);

  await start(handle);

  const result = await handle(
    request("/api/registration/status")
  );

  assert.equal(result.status, 401);
});

test("changing the phone invalidates registration status", async t => {
  const { handle } = setup(t);

  const { cookie } = await start(handle);

  const result = await handle(request(
    "/api/registration/status",
    {
      cookie,
      body: { phone: "+201000000002" }
    }
  ));

  assert.equal(result.status, 401);
});

test("cross-origin registration is rejected", async t => {
  const { handle } = setup(t);

  const result = await handle(request(
    "/api/registration/start",
    { requestOrigin: "https://untrusted.invalid" }
  ));

  assert.equal(result.status, 403);
});

test("registration does not accept client verification flags", async t => {
  const { handle } = setup(t);

  const result = await handle(request(
    "/api/registration/start",
    {
      body: {
        phone,
        verified: true
      }
    }
  ));

  assert.equal(result.status, 400);
});

test("registration status expires", async t => {
  const { handle, setTime } = setup(t);

  const { cookie } = await start(handle);

  setTime(1000);

  const result = await handle(request(
    "/api/registration/status", { cookie }
  ));

  assert.equal(result.status, 401);
});

test("registration cancellation clears its browser cookie", async t => {
  const { handle } = setup(t);

  const { cookie } = await start(handle);

  const result = await handle(request(
    "/api/registration/cancel", { cookie }
  ));

  assert.equal(result.status, 200);

  assert.match(
    result.headers.get("Set-Cookie"),
    /Max-Age=0/
  );
});

test("registration rejects oversized requests", async t => {
  const { handle } = setup(t);

  const result = await handle(request(
    "/api/registration/start",
    {
      body: { phone: "1".repeat(3000) }
    }
  ));

  assert.equal(result.status, 400);
});

test("production worker keeps registration disabled by default", async () => {
  const result = await worker.fetch(
    request("/api/registration/start"),
    {
      APP_ORIGIN: origin,
      ACCOUNTS_ENABLED: "false"
    }
  );

  assert.equal(result.status, 503);
});

test("registration cannot be created with GET", async t => {
  const { handle } = setup(t);

  const result = await handle(request(
    "/api/registration/start",
    { method: "GET" }
  ));

  assert.equal(result.status, 405);
});

test("registration response does not permit caching", async t => {
  const { handle } = setup(t);

  const result = await handle(
    request("/api/registration/start")
  );

  assert.match(
    result.headers.get("Cache-Control"),
    /no-store/
  );

  assert.match(
    result.headers.get("Set-Cookie"),
    /HttpOnly/
  );

  assert.match(
    result.headers.get("Set-Cookie"),
    /Secure/
  );
});
