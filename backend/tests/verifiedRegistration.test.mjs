import test from "node:test";
import assert from "node:assert/strict";

import { databaseForTest } from "./sqliteAdapter.mjs";

import {
  createPendingRegistration,
  verifyPendingRegistration,
  readPendingRegistration,
  cancelPendingRegistration,
  purgeExpiredPendingRegistrations
} from "../pendingRegistration.mjs";

import {
  saveVerifiedRegistration,
  requiredPolicies
} from "../registration.mjs";

const phone = "+201000000001";

const key = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"]
);

function setup(t, role = "consumer") {
  const { database, sql } = databaseForTest(t);

  const policyVersions = new Map(
    requiredPolicies(role).map(
      policy => [policy, "synthetic-v1"]
    )
  );

  const catalogs = {
    today: "2026-11-25",
    districts: new Map([
      ["synthetic-governorate",
       new Set(["synthetic-district"])]
    ]),
    activities: new Set(["synthetic-activity"]),
    policyVersions
  };

  const input = {
    role,
    phone,
    email: role === "consumer"
      ? null : "synthetic@example.invalid",
    fullName: "Synthetic Subscriber",
    birthDate: "1990-01-01",
    governorateCode: "synthetic-governorate",
    districtCode: "synthetic-district",
    address: "Synthetic address",
    latitude: 31,
    longitude: 30,
    language: "ar",
    policyVersions: Object.fromEntries(policyVersions),
    business: {
      name: "Synthetic business",
      activityCode: "synthetic-activity",
      premisesAddress: "Synthetic premises"
    },
    delivery: {
      vehicleType: "car",
      plateLetters: "ABC",
      plateDigits: "1234"
    }
  };

  return { database, sql, catalogs, input };
}

async function pending(database, verified = true) {
  const request = await createPendingRegistration(
    database, key, {
      phone,
      rateSubject: "synthetic-source",
      now: 100,
      expiresAt: 400
    }
  );

  assert.ok(request);

  if (verified) {
    assert.equal(
      await verifyPendingRegistration(
        database, key, {
          id: request.id,
          proof: request.proof,
          sender: phone,
          purpose: "registration"
        },
        105
      ),
      true
    );
  }

  return request;
}

function count(sql) {
  return sql.prepare(
    "SELECT COUNT(*) AS n FROM subscriber"
  ).get().n;
}

test("verified registration creates one incomplete account with trusted phone receipt", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  const result = await saveVerifiedRegistration(
    database, key, binding, input, catalogs, 110
  );

  assert.ok(result.subscriberId);

  const account = sql.prepare(`
    SELECT state, phone_verified_at, email_verified_at
    FROM subscriber WHERE id = ?
  `).get(result.subscriberId);

  assert.equal(account.state, "incomplete");
  assert.equal(account.phone_verified_at, 105);
  assert.equal(account.email_verified_at, null);

  assert.equal(count(sql), 1);

  const receipt = sql.prepare(`
    SELECT pending_id, verified_at, claimed_at
    FROM verified_registration_claim
    WHERE subscriber_id = ?
  `).get(result.subscriberId);

  assert.equal(receipt.pending_id, binding.id);
  assert.equal(receipt.verified_at, 105);
  assert.equal(receipt.claimed_at, 110);
});

test("unverified request cannot create an account", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database, false);

  assert.deepEqual(
    await saveVerifiedRegistration(
      database, key, binding, input, catalogs, 110
    ),
    { issues: ["phoneVerificationRequired"] }
  );

  assert.equal(count(sql), 0);
});

test("another browser cannot claim a verified request", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  const result = await saveVerifiedRegistration(
    database, key,
    { ...binding, browserSecret: "a".repeat(64) },
    input, catalogs, 110
  );

  assert.deepEqual(
    result,
    { issues: ["phoneVerificationRequired"] }
  );

  assert.equal(count(sql), 0);
});

test("verified request cannot be reused", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  await saveVerifiedRegistration(
    database, key, binding, input, catalogs, 110
  );

  const result = await saveVerifiedRegistration(
    database, key, binding, input, catalogs, 111
  );

  assert.deepEqual(
    result,
    { issues: ["phoneVerificationRequired"] }
  );

  assert.equal(count(sql), 1);
});

test("changing the verified phone prevents account creation", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  const result = await saveVerifiedRegistration(
    database, key, binding,
    { ...input, phone: "+201000000002" },
    catalogs, 110
  );

  assert.deepEqual(
    result,
    { issues: ["phoneVerificationRequired"] }
  );

  assert.equal(count(sql), 0);
});

test("expired verification cannot create an account", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  const result = await saveVerifiedRegistration(
    database, key, binding, input, catalogs, 400
  );

  assert.deepEqual(
    result,
    { issues: ["phoneVerificationRequired"] }
  );

  assert.equal(count(sql), 0);
});

test("cancellation invalidates the request on the server", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  assert.equal(
    await cancelPendingRegistration(
      database, key, binding
    ),
    true
  );

  assert.equal(
    await readPendingRegistration(
      database, key,
      { ...binding, phone },
      110
    ),
    null
  );

  assert.deepEqual(
    await saveVerifiedRegistration(
      database, key, binding, input, catalogs, 110
    ),
    { issues: ["phoneVerificationRequired"] }
  );

  assert.equal(count(sql), 0);
});

test("foreign browser cannot cancel a request", async t => {
  const { database } = setup(t);
  const binding = await pending(database);

  assert.equal(
    await cancelPendingRegistration(
      database, key,
      { ...binding, browserSecret: "b".repeat(64) }
    ),
    false
  );

  assert.deepEqual(
    await readPendingRegistration(
      database, key,
      { ...binding, phone },
      110
    ),
    { verified: true }
  );
});

test("consumer date must follow the dynamic minimum age", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  for (const birthDate of [
    "2010-11-26",
    "2012-01-01",
    "2001-02-29"
  ]) {
    const result = await saveVerifiedRegistration(
      database, key, binding,
      { ...input, birthDate },
      catalogs, 110
    );

    assert.ok(
      result.issues.includes("invalidBirthDate")
    );
  }

  assert.equal(count(sql), 0);
});

test("motor vehicle registration rejects missing and invalid plates", async t => {
  const { database, sql, input, catalogs } =
    setup(t, "courier");

  const binding = await pending(database);

  for (const delivery of [
    { vehicleType: "car" },
    {
      vehicleType: "truck",
      plateLetters: "AB",
      plateDigits: "1234"
    },
    {
      vehicleType: "rider",
      plateLetters: "\u0628\u0633",
      plateDigits: "12345"
    }
  ]) {
    const result = await saveVerifiedRegistration(
      database, key, binding,
      { ...input, delivery },
      catalogs, 110
    );

    assert.ok(result.issues.includes("invalidPlate"));
  }

  assert.equal(count(sql), 0);
});

test("bicycle registration requires no plate", async t => {
  const { database, sql, input, catalogs } =
    setup(t, "courier");

  const binding = await pending(database);

  const result = await saveVerifiedRegistration(
    database, key, binding,
    {
      ...input,
      delivery: {
        vehicleType: "bicycle"
      }
    },
    catalogs, 110
  );

  assert.ok(result.subscriberId);
  assert.equal(count(sql), 1);
});

test("duplicate phone cannot consume another verified claim", async t => {
  const { database, sql, input, catalogs } = setup(t);

  const first = await pending(database);
  const second = await pending(database);

  await saveVerifiedRegistration(
    database, key, first, input, catalogs, 110
  );

  await assert.rejects(
    saveVerifiedRegistration(
      database, key, second, input, catalogs, 111
    )
  );

  assert.equal(count(sql), 1);

  assert.deepEqual(
    await readPendingRegistration(
      database, key,
      { ...second, phone },
      112
    ),
    { verified: true }
  );
});

test("expired request cleanup preserves permanent verification receipts", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  await saveVerifiedRegistration(
    database, key, binding, input, catalogs, 110
  );

  await purgeExpiredPendingRegistrations(
    database, 400
  );

  assert.equal(count(sql), 1);

  assert.equal(
    sql.prepare(`
      SELECT COUNT(*) AS n
      FROM verified_registration_claim
    `).get().n,
    1
  );
});

test("consumer accepts an older birth year", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  const result = await saveVerifiedRegistration(
    database, key, binding,
    { ...input, birthDate: "1940-01-01" },
    catalogs, 110
  );

  assert.ok(result.subscriberId);
  assert.equal(count(sql), 1);
});

test("consumer accepts the exact sixteenth birthday", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  const result = await saveVerifiedRegistration(
    database, key, binding,
    { ...input, birthDate: "2010-11-25" },
    catalogs, 110
  );

  assert.ok(result.subscriberId);
  assert.equal(count(sql), 1);
});

test("consumer accepts a valid leap day", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  const result = await saveVerifiedRegistration(
    database, key, binding,
    { ...input, birthDate: "2000-02-29" },
    catalogs, 110
  );

  assert.ok(result.subscriberId);
  assert.equal(count(sql), 1);
});

test("invalid consumer dates never create accounts", async t => {
  const { database, sql, input, catalogs } = setup(t);
  const binding = await pending(database);

  for (const birthDate of [
    null,
    "",
    "invalid",
    "1990-13-01",
    "1990-04-31",
    "2010-11-26",
    "2012-01-01"
  ]) {
    const result = await saveVerifiedRegistration(
      database, key, binding,
      { ...input, birthDate },
      catalogs, 110
    );

    assert.ok(result.issues?.includes("invalidBirthDate"));
    assert.equal(count(sql), 0);
  }
});
