import test from "node:test";
import assert from "node:assert/strict";

import {
  createApprovedDistricts,
  createRegistrationCatalogs
} from "../registrationCatalogs.mjs";

import {
  validateRegistration,
  requiredPolicies
} from "../registration.mjs";

test("trusted registration uses all 27 approved governorates and 936 areas", () => {
  const districts = createApprovedDistricts();

  assert.equal(districts.size, 27);

  assert.equal(
    [...districts.values()].reduce(
      (total, areas) => total + areas.size,
      0
    ),
    936
  );
});

test("catalogs cannot be enabled without approved policy and activity inputs", () => {
  assert.throws(() => createRegistrationCatalogs({
    activities: new Set(),
    policyVersions: new Map(),
    now: 1795564800
  }));
});

test("registration rejects areas belonging to another governorate", () => {
  const policies = new Map(
    requiredPolicies("consumer").map(
      policy => [policy, "synthetic-test-only"]
    )
  );

  const catalogs = createRegistrationCatalogs({
    activities: new Set(["synthetic-test-only"]),
    policyVersions: policies,
    now: 1795564800
  });

  const entries = [...catalogs.districts.entries()];
  const [firstCode, firstAreas] = entries[0];
  const [, secondAreas] = entries[1];

  const input = {
    role: "consumer",
    fullName: "Synthetic Subscriber",
    phone: "+201000000001",
    birthDate: "1990-01-01",
    governorateCode: firstCode,
    districtCode: [...firstAreas][0],
    address: "Synthetic address",
    latitude: 31,
    longitude: 30,
    policyVersions: Object.fromEntries(policies)
  };

  assert.deepEqual(
    validateRegistration(input, catalogs),
    []
  );

  assert.ok(
    validateRegistration({
      ...input,
      districtCode: [...secondAreas].find(
        id => !firstAreas.has(id)
      )
    }, catalogs).includes("invalidDistrict")
  );

  assert.ok(
    validateRegistration({
      ...input,
      districtCode: "unapproved-area"
    }, catalogs).includes("invalidDistrict")
  );
});

test("catalog copies cannot mutate the source catalog", () => {
  const first = createApprovedDistricts();
  first.clear();

  assert.equal(createApprovedDistricts().size, 27);
});
