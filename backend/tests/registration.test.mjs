import assert from "node:assert/strict";
import test from "node:test";
import { requiredPolicies, validateRegistration } from "../registration.mjs";

const config = {
  today: "2026-11-24",
  districts: new Map([["test", new Set(["district"])]]),
  activities: new Set(["approved-test-activity"]),
  policyVersions: new Map([...requiredPolicies("consumer")].map(policy => [policy, "v1"])),
};

function fixture(role) {
  return {
    role, fullName: "اسم تجريبي", phone: "+201000000000",
    email: role === "consumer" ? null : "person@example.test",
    birthDate: "2008-11-24", governorateCode: "test", districtCode: "district",
    address: "عنوان تجريبي", latitude: 30, longitude: 31,
    business: { name: "متجر تجريبي", premisesAddress: "عنوان الفرع", activityCode: "approved-test-activity" },
    delivery: { vehicleType: "rider" },
    policyVersions: Object.fromEntries(requiredPolicies(role).map(policy => [policy, "v1"])),
  };
}

test("each approved role has its own minimum registration fields", () => {
  for (const role of ["supplier", "retailer", "consumer", "courier"]) {
    assert.deepEqual(validateRegistration(fixture(role), config), []);
  }
  assert.deepEqual(validateRegistration({ ...fixture("retailer"), email: null, business: null }, config),
    ["emailRequired", "businessNameRequired", "premisesAddressRequired", "invalidBusinessActivity"]);
  assert.deepEqual(validateRegistration({ ...fixture("courier"), delivery: null }, config), ["invalidVehicle"]);
});

test("invalid dates, underage applicants and stale policies are rejected", () => {
  const input = fixture("consumer");
  assert.deepEqual(validateRegistration({ ...input, birthDate: "2008-11-25" }, config), ["minimumAge"]);
  assert.deepEqual(validateRegistration({ ...input, birthDate: "2000-02-31" }, config), ["invalidBirthDate"]);
  assert.deepEqual(validateRegistration({ ...input, policyVersions: {} }, config), ["policiesRequired"]);
  assert.deepEqual(validateRegistration({ ...input, districtCode: "other", latitude: null }, config),
    ["invalidDistrict", "invalidLocation"]);
});
