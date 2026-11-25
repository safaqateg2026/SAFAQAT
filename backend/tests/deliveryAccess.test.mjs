import test from "node:test";
import assert from "node:assert/strict";

import { databaseForTest } from "./sqliteAdapter.mjs";

import {
  createDeliveryRequest,
  acceptDeliveryRequest,
  declineDeliveryRequest
} from "../deliveryRequests.mjs";

import {
  readPrivateDeliveryRoute,
  readOwnDeliveryHistory
} from "../deliveryAccess.mjs";

import {
  setCourierAvailable,
  setCourierUnavailable,
  removeExpiredCourierLocations
} from "../marketplacePresence.mjs";

const buyer = { id: "buyer", role: "consumer" };
const stranger = { id: "stranger", role: "consumer" };
const rider = { id: "rider", role: "courier" };
const rider2 = { id: "rider2", role: "courier" };
const driver = { id: "driver", role: "courier" };

const pickup = {
  latitude: 31.2,
  longitude: 29.9
};

const destination = {
  latitude: 31.21,
  longitude: 29.91
};

function setup(t) {
  const { database, sql } = databaseForTest(t);

  function account(actor, number, vehicle) {
    const email = actor.role === "consumer"
      ? null
      : `${actor.id}@example.invalid`;

    sql.prepare(`
      INSERT INTO subscriber (
        id, role, phone, email, full_name,
        birth_date, governorate_code, district_code,
        address, latitude, longitude, created_at
      ) VALUES (
        ?, ?, ?, ?, 'Synthetic account',
        '1990-01-01', 'test', 'test',
        'Synthetic address', 31.2, 29.9, 100
      )
    `).run(
      actor.id,
      actor.role,
      "+2010" + String(number).padStart(8, "0"),
      email
    );

    sql.prepare(`
      UPDATE subscriber
      SET phone_verified_at=101,
          email_verified_at=?
      WHERE id=?
    `).run(email ? 101 : null, actor.id);

    for (const policy of [
      "terms", "privacy", "commission",
      "sales_purchase", "delivery"
    ]) {
      sql.prepare(`
        INSERT INTO subscriber_policy_acceptance
        VALUES (?, ?, 'synthetic', 101)
      `).run(actor.id, policy);
    }

    if (actor.role !== "consumer") {
      sql.prepare(`
        INSERT INTO subscriber_verification_review (
          id, subscriber_id, administrator_id,
          decision, reviewed_at
        ) VALUES (?, ?, 'synthetic-admin', 'approved', 102)
      `).run(actor.id + "-review", actor.id);
    }

    sql.prepare(`
      UPDATE subscriber SET state='active'
      WHERE id=?
    `).run(actor.id);

    if (vehicle) {
      sql.prepare(`
        INSERT INTO subscriber_delivery (
          subscriber_id, vehicle_type
        ) VALUES (?, ?)
      `).run(actor.id, vehicle);
    }
  }

  account(buyer, 1);
  account(stranger, 2);
  account(rider, 3, "rider");
  account(rider2, 4, "rider");
  account(driver, 5, "car");

  return { database, sql };
}

async function request(database) {
  return await createDeliveryRequest(
    database,
    buyer,
    { vehicleType: "rider", pickup, destination },
    110
  );
}

test("only requester can read an unassigned route", async t => {
  const { database } = setup(t);
  const r = await request(database);

  assert.ok(await readPrivateDeliveryRoute(
    database, buyer, r.id
  ));

  for (const actor of [stranger, rider, rider2, driver]) {
    assert.equal(await readPrivateDeliveryRoute(
      database, actor, r.id
    ), null);
  }
});

test("only the assigned courier receives route access", async t => {
  const { database } = setup(t);
  const r = await request(database);

  assert.equal(await setCourierAvailable(
    database, rider, pickup, 111, 100
  ), true);

  assert.ok(await acceptDeliveryRequest(
    database, rider, r.id, 120
  ));

  const route = await readPrivateDeliveryRoute(
    database, rider, r.id
  );

  assert.equal(route.destinationLatitude, destination.latitude);

  assert.equal(await readPrivateDeliveryRoute(
    database, rider2, r.id
  ), null);
});

test("competing couriers cannot both accept", async t => {
  const { database } = setup(t);
  const r = await request(database);

  for (const actor of [rider, rider2]) {
    await setCourierAvailable(
      database, actor, pickup, 111, 100
    );
  }

  const results = await Promise.all([
    acceptDeliveryRequest(database, rider, r.id, 120),
    acceptDeliveryRequest(database, rider2, r.id, 120)
  ]);

  assert.equal(results.filter(Boolean).length, 1);
});

test("wrong vehicle category cannot accept", async t => {
  const { database } = setup(t);
  const r = await request(database);

  await setCourierAvailable(
    database, driver, pickup, 111, 100
  );

  assert.equal(await acceptDeliveryRequest(
    database, driver, r.id, 120
  ), null);
});

test("declining leaves the request available", async t => {
  const { database } = setup(t);
  const r = await request(database);

  assert.equal(await declineDeliveryRequest(
    database, rider, r.id, 115
  ), true);

  await setCourierAvailable(
    database, rider2, pickup, 116, 100
  );

  assert.ok(await acceptDeliveryRequest(
    database, rider2, r.id, 120
  ));
});

test("expired courier location is removed", async t => {
  const { database, sql } = setup(t);

  await setCourierAvailable(
    database, rider, pickup, 110, 10
  );

  assert.equal(await removeExpiredCourierLocations(
    database, 120
  ), 1);

  assert.equal(sql.prepare(`
    SELECT COUNT(*) AS n
    FROM courier_marketplace_presence
  `).get().n, 0);
});

test("going unavailable removes courier coordinates", async t => {
  const { database, sql } = setup(t);

  await setCourierAvailable(
    database, rider, pickup, 110, 100
  );

  assert.equal(await setCourierUnavailable(
    database, rider
  ), true);

  assert.equal(sql.prepare(`
    SELECT COUNT(*) AS n
    FROM courier_marketplace_presence
  `).get().n, 0);
});

test("history contains no private route coordinates", async t => {
  const { database, sql } = setup(t);
  const r = await request(database);

  sql.prepare(`
    UPDATE delivery_request
    SET state='cancelled', updated_at=120
    WHERE id=?
  `).run(r.id);

  const history = await readOwnDeliveryHistory(
    database, buyer
  );

  assert.equal(history.length, 1);
  assert.equal(history[0].state, "cancelled");
  assert.equal(history[0].pickupLatitude, undefined);
  assert.equal(history[0].destinationLongitude, undefined);

  assert.equal(await readPrivateDeliveryRoute(
    database, buyer, r.id
  ), null);

  assert.deepEqual(await readOwnDeliveryHistory(
    database, stranger
  ), []);
});

test("suspended courier loses route access", async t => {
  const { database, sql } = setup(t);
  const r = await request(database);

  await setCourierAvailable(
    database, rider, pickup, 111, 100
  );

  await acceptDeliveryRequest(
    database, rider, r.id, 120
  );

  sql.prepare(`
    UPDATE subscriber SET state='suspended'
    WHERE id=?
  `).run(rider.id);

  assert.equal(await readPrivateDeliveryRoute(
    database, rider, r.id
  ), null);
});

test("forged role does not grant route access", async t => {
  const { database } = setup(t);
  const r = await request(database);

  assert.equal(await readPrivateDeliveryRoute(
    database,
    { id: buyer.id, role: "supplier" },
    r.id
  ), null);
});

test("invalid presence coordinates are rejected", async t => {
  const { database } = setup(t);

  assert.equal(await setCourierAvailable(
    database,
    rider,
    { latitude: 200, longitude: 29.9 },
    110,
    100
  ), false);
});

test("suspended requester cannot receive assignment", async t => {
  const { database, sql } = setup(t);
  const r = await request(database);

  await setCourierAvailable(
    database, rider, pickup, 111, 100
  );

  sql.prepare(`
    UPDATE subscriber SET state='suspended'
    WHERE id=?
  `).run(buyer.id);

  assert.equal(await acceptDeliveryRequest(
    database, rider, r.id, 120
  ), null);
});
