import test from "node:test";
import assert from "node:assert/strict";

import {
  createApprovedActivities,
  isApprovedBusinessActivity
} from "../businessActivities.mjs";

import {
  createRegistrationCatalogs
} from "../registrationCatalogs.mjs";

import {
  validateRegistration,
  requiredPolicies
} from "../registration.mjs";

test("all eleven approved activity identifiers remain unique", () => {
  assert.equal(createApprovedActivities().size, 11);
});

test("supplier and retailer activities remain isolated", () => {
  assert.equal(isApprovedBusinessActivity("supplier", "supplier-0"), true);
  assert.equal(isApprovedBusinessActivity("retailer", "merchant-7"), true);
  assert.equal(isApprovedBusinessActivity("supplier", "merchant-7"), false);
  assert.equal(isApprovedBusinessActivity("retailer", "supplier-0"), false);
  assert.equal(isApprovedBusinessActivity("consumer", "supplier-0"), false);
  assert.equal(isApprovedBusinessActivity("courier", "merchant-7"), false);
  assert.equal(isApprovedBusinessActivity("supplier", "unknown"), false);
});

test("trusted registration rejects activity substitution between roles", () => {
  const policies = new Map(
    requiredPolicies("supplier").map(
      policy => [policy, "synthetic-test-only"]
    )
  );

  const catalogs = createRegistrationCatalogs({
    activities: createApprovedActivities(),
    policyVersions: policies,
    now: 1795564800
  });

  const [governorateCode, areas] = [...catalogs.districts][0];

  const input = {
    role: "supplier",
    fullName: "Synthetic Subscriber",
    phone: "+201000000001",
    email: "sample@example.invalid",
    birthDate: "1990-01-01",
    governorateCode,
    districtCode: [...areas][0],
    address: "Synthetic address",
    latitude: 31,
    longitude: 30,
    business: {
      name: "Synthetic business",
      premisesAddress: "Synthetic premises",
      activityCode: "supplier-0"
    },
    policyVersions: Object.fromEntries(policies)
  };

  assert.deepEqual(validateRegistration(input, catalogs), []);

  assert.ok(validateRegistration({
    ...input,
    business: {
      ...input.business,
      activityCode: "merchant-7"
    }
  }, catalogs).includes("invalidBusinessActivity"));
});
