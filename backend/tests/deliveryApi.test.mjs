import test from "node:test";
import assert from "node:assert/strict";

import { databaseForTest } from "./sqliteAdapter.mjs";
import { createDeliveryApi } from "../deliveryApi.mjs";
import { createDeliveryRequest } from "../deliveryRequests.mjs";
import { issueVerifiedSession } from "../sessions.mjs";
import worker from "../cloud/worker.mjs";

const origin = "https://delivery.example.invalid";

async function setup(t) {
  const { database, sql } = databaseForTest(t);

  const tokens = {};

  for (const [id, number] of [
    ["buyer", 1],
    ["stranger", 2]
  ]) {
    sql.prepare(`
      INSERT INTO subscriber (
        id, role, phone, full_name,
        birth_date, governorate_code, district_code,
        address, latitude, longitude, created_at
      ) VALUES (
        ?, 'consumer', ?, 'Synthetic account',
        '1990-01-01', 'test', 'test',
        'Synthetic address', 31.2, 29.9, 100
      )
    `).run(
      id,
      "+2010" + String(number).padStart(8, "0")
    );

    for (const policy of [
      "terms", "privacy", "commission",
      "sales_purchase", "delivery"
    ]) {
      sql.prepare(`
        INSERT INTO subscriber_policy_acceptance
        VALUES (?, ?, 'synthetic', 101)
      `).run(id, policy);
    }

    sql.prepare(`
      UPDATE subscriber
      SET phone_verified_at=102
      WHERE id=?
    `).run(id);

    sql.prepare(`
      UPDATE subscriber SET state='active'
      WHERE id=?
    `).run(id);

    const session = await issueVerifiedSession(
      database,
      {
        subscriberId: id,
        now: 103,
        expiresAt: 300
      }
    );

    assert.ok(session);
    tokens[id] = session.token;
  }

  const delivery = await createDeliveryRequest(
    database,
    { id: "buyer", role: "consumer" },
    {
      vehicleType: "rider",
      pickup: { latitude: 31.2, longitude: 29.9 },
      destination: {
        latitude: 31.21,
        longitude: 29.91
      }
    },
    110
  );

  const api = createDeliveryApi({
    database,
    origin,
    clock: () => 120
  });

  function call(path, token, options = {}) {
    const headers = new Headers(options.headers);

    if (token) {
      headers.set(
        "Cookie",
        "__Host-safaqat_session=" + token
      );
    }

    return api(new Request(origin + path, {
      ...options,
      headers
    }));
  }

  return { database, sql, tokens, delivery, call };
}

test("delivery history requires authentication", async t => {
  const { call } = await setup(t);

  const response = await call("/api/delivery/history");

  assert.equal(response.status, 401);
});

test("forged session cannot access delivery", async t => {
  const { call } = await setup(t);

  const response = await call(
    "/api/delivery/history", "a".repeat(64)
  );

  assert.equal(response.status, 401);
});

test("owner receives only own delivery history", async t => {
  const { call, tokens, delivery } = await setup(t);

  const response = await call(
    "/api/delivery/history", tokens.buyer
  );

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.requests.length, 1);
  assert.equal(body.requests[0].id, delivery.id);
  assert.equal(body.requests[0].pickupLatitude, undefined);

  assert.equal(
    response.headers.get("Cache-Control"),
    "private, no-store"
  );
});

test("stranger cannot access another delivery route", async t => {
  const { call, tokens, delivery } = await setup(t);

  const response = await call(
    `/api/delivery/${delivery.id}/route`,
    tokens.stranger
  );

  assert.equal(response.status, 404);
});

test("requester can read private route", async t => {
  const { call, tokens, delivery } = await setup(t);

  const response = await call(
    `/api/delivery/${delivery.id}/route`,
    tokens.buyer
  );

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.destinationLatitude, 31.21);
});

test("client cannot select another actor", async t => {
  const { call, tokens } = await setup(t);

  const response = await call(
    "/api/delivery/history?subscriberId=buyer",
    tokens.stranger
  );

  assert.equal(response.status, 400);
});

test("cross-origin delivery access is denied", async t => {
  const { call, tokens } = await setup(t);

  const response = await call(
    "/api/delivery/history",
    tokens.buyer,
    { headers: { Origin: "https://other.invalid" } }
  );

  assert.equal(response.status, 403);
});

test("delivery history limit is bounded", async t => {
  const { call, tokens } = await setup(t);

  for (const limit of ["0", "51", "-1", "abc"]) {
    const response = await call(
      `/api/delivery/history?limit=${limit}`,
      tokens.buyer
    );

    assert.equal(response.status, 400);
  }
});

test("duplicate query parameters are rejected", async t => {
  const { call, tokens } = await setup(t);

  const response = await call(
    "/api/delivery/history?limit=1&limit=2",
    tokens.buyer
  );

  assert.equal(response.status, 400);
});

test("revoked session cannot read routes", async t => {
  const { call, sql, tokens, delivery } = await setup(t);

  sql.prepare(`
    UPDATE subscriber_session
    SET revoked_at=115
    WHERE subscriber_id='buyer'
  `).run();

  const response = await call(
    `/api/delivery/${delivery.id}/route`,
    tokens.buyer
  );

  assert.equal(response.status, 401);
});

test("suspended account cannot read delivery history", async t => {
  const { call, sql, tokens } = await setup(t);

  sql.prepare(`
    UPDATE subscriber SET state='suspended'
    WHERE id='buyer'
  `).run();

  const response = await call(
    "/api/delivery/history", tokens.buyer
  );

  assert.equal(response.status, 401);
});

test("delivery mutations remain unavailable", async t => {
  const { call, tokens } = await setup(t);

  const response = await call(
    "/api/delivery/history",
    tokens.buyer,
    { method: "POST" }
  );

  assert.equal(response.status, 405);
});

test("worker delivery route is disabled by default", async () => {
  const response = await worker.fetch(
    new Request(origin + "/api/delivery/history"),
    { APP_ORIGIN: origin }
  );

  assert.equal(response.status, 503);

  assert.deepEqual(await response.json(), {
    error: "delivery_disabled"
  });
});
