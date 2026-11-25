import test from "node:test";
import assert from "node:assert/strict";

import { databaseForTest } from "./sqliteAdapter.mjs";

import {
  createPendingRegistration,
  verifyPendingRegistration,
  readPendingRegistration,
  purgeExpiredPendingRegistrations
} from "../pendingRegistration.mjs";

import {
  writePendingRegistrationCookie,
  readPendingRegistrationCookie,
  clearPendingRegistrationCookie
} from "../pendingRegistrationCookie.mjs";

const key = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"]
);

const phone = "+201000000001";

async function issue(database, extra = {}) {
  return createPendingRegistration(database, key, {
    phone,
    rateSubject: "synthetic-source",
    now: 100,
    expiresAt: 400,
    ...extra
  });
}

function event(pending, extra = {}) {
  return {
    id: pending.id,
    proof: pending.proof,
    purpose: "registration",
    sender: phone,
    ...extra
  };
}

function binding(pending, extra = {}) {
  return {
    id: pending.id,
    browserSecret: pending.browserSecret,
    phone,
    ...extra
  };
}

test("pending requests do not reserve subscriber phone numbers", async t => {
  const { database, sql } = databaseForTest(t);

  const first = await issue(database);
  const second = await issue(database);

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.id, second.id);

  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM subscriber").get().n,
    0
  );

  assert.equal(
    sql.prepare("SELECT COUNT(*) AS n FROM pending_registration").get().n,
    2
  );
});

test("pending secrets are stored only as digests", async t => {
  const { database, sql } = databaseForTest(t);
  const pending = await issue(database);

  const row = sql.prepare(
    "SELECT * FROM pending_registration"
  ).get();

  const serialized = JSON.stringify(row);

  assert.ok(!serialized.includes(phone));
  assert.ok(!serialized.includes(pending.proof));
  assert.ok(!serialized.includes(pending.browserSecret));
});

test("valid provider proof verifies only its matching pending request", async t => {
  const { database } = databaseForTest(t);

  const first = await issue(database);
  const second = await issue(database);

  assert.deepEqual(
    await readPendingRegistration(
      database, key, binding(first), 101
    ),
    { verified: false }
  );

  assert.equal(
    await verifyPendingRegistration(
      database, key, event(first), 102
    ),
    true
  );

  assert.deepEqual(
    await readPendingRegistration(
      database, key, binding(first), 103
    ),
    { verified: true }
  );

  assert.deepEqual(
    await readPendingRegistration(
      database, key, binding(second), 103
    ),
    { verified: false }
  );
});

test("incorrect sender and proof are rejected", async t => {
  const { database } = databaseForTest(t);
  const pending = await issue(database);

  for (const extra of [
    { sender: "+201000000002" },
    { proof: "0".repeat(64) },
    { purpose: "login" }
  ]) {
    assert.equal(
      await verifyPendingRegistration(
        database, key, event(pending, extra), 101
      ),
      false
    );
  }
});

test("verified proof cannot be reused", async t => {
  const { database } = databaseForTest(t);
  const pending = await issue(database);

  assert.equal(
    await verifyPendingRegistration(
      database, key, event(pending), 101
    ),
    true
  );

  assert.equal(
    await verifyPendingRegistration(
      database, key, event(pending), 102
    ),
    false
  );
});

test("another browser cannot read verification status", async t => {
  const { database } = databaseForTest(t);

  const first = await issue(database);
  const second = await issue(database);

  assert.equal(
    await readPendingRegistration(
      database, key,
      binding(first, {
        browserSecret: second.browserSecret
      }), 101
    ),
    null
  );
});

test("changing the submitted phone invalidates the binding", async t => {
  const { database } = databaseForTest(t);
  const pending = await issue(database);

  assert.equal(
    await readPendingRegistration(
      database, key,
      binding(pending, {
        phone: "+201000000002"
      }), 101
    ),
    null
  );
});

test("expired requests cannot be verified or queried", async t => {
  const { database } = databaseForTest(t);
  const pending = await issue(database);

  assert.equal(
    await verifyPendingRegistration(
      database, key, event(pending), 400
    ),
    false
  );

  assert.equal(
    await readPendingRegistration(
      database, key, binding(pending), 400
    ),
    null
  );
});

test("expired requests can be removed without affecting current requests", async t => {
  const { database, sql } = databaseForTest(t);

  await issue(database);

  await issue(database, {
    now: 200,
    expiresAt: 500
  });

  assert.equal(
    await purgeExpiredPendingRegistrations(
      database, 400
    ),
    1
  );

  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS n FROM pending_registration"
    ).get().n,
    1
  );
});

test("request issuance is rate limited per phone", async t => {
  const { database } = databaseForTest(t);

  for (let i = 0; i < 5; i++) {
    assert.ok(await issue(database));
  }

  assert.equal(await issue(database), null);
});

test("invalid phone and excessive expiry are rejected", async t => {
  const { database } = databaseForTest(t);

  await assert.rejects(
    issue(database, { phone: "invalid" }),
    TypeError
  );

  await assert.rejects(
    issue(database, { expiresAt: 10000 }),
    TypeError
  );
});

test("registration cookie is secure and host only", async t => {
  const { database } = databaseForTest(t);
  const pending = await issue(database);

  const cookie = writePendingRegistrationCookie(
    pending, 100
  );

  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=300/);
  assert.doesNotMatch(cookie, /Domain=/i);

  assert.deepEqual(
    readPendingRegistrationCookie(
      cookie.split(";")[0]
    ),
    {
      id: pending.id,
      browserSecret: pending.browserSecret
    }
  );
});

test("duplicate registration cookies are rejected", async t => {
  const { database } = databaseForTest(t);
  const pending = await issue(database);

  const cookie = writePendingRegistrationCookie(
    pending, 100
  ).split(";")[0];

  assert.equal(
    readPendingRegistrationCookie(
      cookie + "; " + cookie
    ),
    null
  );

  assert.match(
    clearPendingRegistrationCookie(),
    /Max-Age=0/
  );
});


test("database rejects claiming an unverified request", async t => {
  const { database, sql } = databaseForTest(t);

  const pending = await issue(database);

  assert.ok(pending);

  const row = sql.prepare(
    "SELECT verified_at, claimed_at FROM pending_registration WHERE id = ?"
  ).get(pending.id);

  assert.equal(row.verified_at, null);
  assert.equal(row.claimed_at, null);

  assert.throws(
    () => sql.prepare(
      "UPDATE pending_registration SET claimed_at = ? WHERE id = ?"
    ).run(101, pending.id),
    /CHECK constraint failed/
  );

  assert.equal(
    sql.prepare(
      "SELECT claimed_at FROM pending_registration WHERE id = ?"
    ).get(pending.id).claimed_at,
    null
  );
});

test("database rejects claims outside the verified time window", async t => {
  const { database, sql } = databaseForTest(t);

  const pending = await issue(database);

  assert.equal(
    await verifyPendingRegistration(
      database, key, event(pending), 105
    ),
    true
  );

  const update = sql.prepare(
    "UPDATE pending_registration SET claimed_at = ? WHERE id = ?"
  );

  assert.throws(
    () => update.run(104, pending.id),
    /CHECK constraint failed/
  );

  assert.throws(
    () => update.run(400, pending.id),
    /CHECK constraint failed/
  );

  update.run(106, pending.id);

  assert.equal(
    sql.prepare(
      "SELECT claimed_at FROM pending_registration WHERE id = ?"
    ).get(pending.id).claimed_at,
    106
  );

  assert.equal(
    await readPendingRegistration(
      database, key, binding(pending), 107
    ),
    null
  );
});
