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

test("age eligible dates are accepted and invalid dates and stale policies are rejected", () => {
  const input = fixture("consumer");
  assert.deepEqual(validateRegistration({ ...input, birthDate: "2014-11-25" }, config), ["invalidBirthDate"]);
  assert.deepEqual(validateRegistration({ ...input, birthDate: "2000-02-31" }, config), ["invalidBirthDate"]);
  assert.deepEqual(validateRegistration({ ...input, birthDate: "2026-11-25" }, config), ["invalidBirthDate"]);
  assert.deepEqual(validateRegistration({ ...input, birthDate: "2024-02-29" }, config), ["invalidBirthDate"]);
  assert.deepEqual(validateRegistration({ ...input, birthDate: "2025-02-29" }, config), ["invalidBirthDate"]);
  assert.deepEqual(validateRegistration({ ...input, policyVersions: {} }, config), ["policiesRequired"]);
  assert.deepEqual(validateRegistration({ ...input, districtCode: "other", latitude: null }, config),
    ["invalidDistrict", "invalidLocation"]);
});

test("courier plate fields stay optional and reject characters outside the separate Arabic formats", () => {
  const input = fixture("courier");
  assert.deepEqual(validateRegistration({ ...input, delivery: { vehicleType: "rider", plateLetters: "س ب ي", plateDigits: "٤٣٦٣" } }, config), []);
  assert.deepEqual(validateRegistration({ ...input, delivery: { vehicleType: "rider", plateLetters: "ABC", plateDigits: "43-63" } }, config), ["invalidPlate"]);
  assert.deepEqual(validateRegistration({ ...input, delivery: { vehicleType: "rider", plateLetters: "", plateDigits: "" } }, config), []);
});


test("bicycles are accepted without plates and reject any plate values", () => {
  const input = fixture("courier");
  assert.deepEqual(validateRegistration({ ...input, delivery: { vehicleType: "bicycle" } }, config), []);
  assert.deepEqual(validateRegistration({ ...input, delivery: { vehicleType: "bicycle", plateLetters: "س", plateDigits: "1" } }, config), ["invalidPlate"]);
});


test("each registration role enforces its exact minimum age", () => {
  for (const role of ["consumer", "supplier", "retailer", "courier"]) {
    const year = role === "consumer" ? 2010 : 2008;

    assert.deepEqual(
      validateRegistration({
        ...fixture(role),
        birthDate: `${year}-11-24`
      }, config),
      []
    );

    assert.deepEqual(
      validateRegistration({
        ...fixture(role),
        birthDate: `${year}-11-25`
      }, config),
      ["invalidBirthDate"]
    );

    assert.deepEqual(
      validateRegistration({
        ...fixture(role),
        birthDate: "1940-01-01"
      }, config),
      []
    );
  }
});
