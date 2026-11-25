import test from "node:test";
import assert from "node:assert/strict";

import {
  approximateDistanceMeters,
  sortNearby,
  nearbyVehicles,
  validPaymentMethods,
  acceptsPayment,
  canRequestDelivery
} from "../../shared/marketplaceRules.mjs";

const origin = { latitude: 31.2, longitude: 29.9 };

const entries = [
  {
    id: "far",
    location: { latitude: 31.23, longitude: 29.9 }
  },
  {
    id: "near",
    location: { latitude: 31.201, longitude: 29.9 }
  },
  {
    id: "middle",
    location: { latitude: 31.21, longitude: 29.9 }
  }
];

test("same location has zero distance", () => {
  assert.equal(approximateDistanceMeters(origin, origin), 0);
});

test("invalid coordinates are rejected", () => {
  assert.equal(approximateDistanceMeters(
    origin,
    { latitude: 999, longitude: 0 }
  ), null);
});

test("distance calculation is approximately correct", () => {
  const distance = approximateDistanceMeters(
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 }
  );

  assert.ok(distance > 111000 && distance < 112000);
});

test("nearby entries are sorted nearest first", () => {
  assert.deepEqual(
    sortNearby(origin, entries).map(item => item.id),
    ["near", "middle", "far"]
  );
});

test("approximate distance is explicitly identified", () => {
  assert.equal(
    sortNearby(origin, entries)[0].distanceKind,
    "approximate"
  );
});

test("invalid locations are excluded", () => {
  assert.equal(sortNearby(origin, [
    ...entries,
    { id: "invalid", location: null }
  ]).length, 3);
});

test("only selected available vehicle category is returned", () => {
  const vehicles = [
    { ...entries[0], vehicleType: "rider", available: true },
    { ...entries[1], vehicleType: "car", available: true },
    { ...entries[2], vehicleType: "rider", available: false }
  ];

  assert.deepEqual(
    nearbyVehicles(origin, vehicles, "rider").map(v => v.id),
    ["far"]
  );
});

test("unsupported vehicle categories are rejected", () => {
  assert.deepEqual(nearbyVehicles(origin, [], "unknown"), []);
});

test("all approved payment methods are supported", () => {
  assert.equal(validPaymentMethods([
    "cash", "wallet", "instapay", "fawry"
  ]), true);
});

test("unsupported and duplicate payment methods are rejected", () => {
  assert.equal(validPaymentMethods(["unknown"]), false);
  assert.equal(validPaymentMethods(["cash", "cash"]), false);
  assert.equal(validPaymentMethods([]), false);
});

test("consumer cannot select an unsupported payment method", () => {
  assert.equal(acceptsPayment(["cash"], "wallet"), false);
  assert.equal(acceptsPayment(["cash"], "cash"), true);
});

test("approved account roles can request delivery", () => {
  for (const role of ["supplier", "retailer", "consumer"]) {
    assert.equal(canRequestDelivery(role), true);
  }

  assert.equal(canRequestDelivery("courier"), false);
  assert.equal(canRequestDelivery("administrator"), false);
});
