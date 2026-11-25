import test from "node:test";
import assert from "node:assert/strict";

import {
  validCompletionInput,
  completeRegistration
} from "../registrationCompletion.mjs";

import {
  createPendingRegistrationApi
} from "../pendingRegistrationApi.mjs";

import { databaseForTest } from "./sqliteAdapter.mjs";

const origin = "https://testing.safaqat.invalid";

const sample = {
  role: "consumer",
  fullName: "Synthetic test account",
  phone: "+201000000001",
  email: null,
  birthDate: "1990-01-01",
  governorateCode: "test",
  districtCode: "district",
  address: "Synthetic address",
  latitude: 30,
  longitude: 31,
  policyVersions: {
    terms: "v1",
    privacy: "v1",
    commission: "v1",
    sales_purchase: "v1",
    delivery: "v1"
  }
};

test("valid synthetic consumer input is accepted by schema", () => {
  assert.equal(validCompletionInput(sample), true);
});

test("client cannot claim verification or activation", () => {
  for (const extra of [
    { verified: true },
    { phoneVerified: true },
    { emailVerified: true },
    { state: "active" },
    { administrator: true },
    { subscriberId: "forged" }
  ]) {
    assert.equal(
      validCompletionInput({ ...sample, ...extra }),
      false
    );
  }
});

test("invalid and oversized fields are rejected", () => {
  for (const extra of [
    { fullName: "x".repeat(151) },
    { address: "x".repeat(301) },
    { role: "admin" },
    { latitude: "30" },
    { phone: "123" },
    { policyVersions: [] },
    { policyVersions: { administrator: "v1" } },
    { delivery: { vehicleType: "car" } }
  ]) {
    assert.equal(
      validCompletionInput({ ...sample, ...extra }),
      false
    );
  }
});

test("completion fails closed without trusted catalogs", async () => {
  const result = await completeRegistration({
    catalogs: null
  });

  assert.equal(result.status, 503);
});

test("completion requires the original browser cookie", async () => {
  const result = await completeRegistration({
    request: new Request(origin),
    catalogs: {
      districts: new Map(),
      activities: new Set(),
      policyVersions: new Map([["terms", "v1"]])
    }
  });

  assert.equal(result.status, 401);
});

test("completion route remains disabled without approved catalogs", async t => {
  const { database, sql } = databaseForTest(t);

  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const handle = createPendingRegistrationApi({
    database,
    key,
    origin,
    businessPhone: "201000000009",
    trustedRateSubject: () => "synthetic-source",
    clock: () => 100
  });

  const result = await handle(new Request(
    `${origin}/api/registration/complete`,
    {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(sample)
    }
  ));

  assert.equal(result.status, 503);

  assert.equal(sql.prepare(
    "SELECT COUNT(*) AS n FROM subscriber"
  ).get().n, 0);
});
