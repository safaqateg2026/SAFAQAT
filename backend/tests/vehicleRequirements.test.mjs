import assert from "node:assert/strict";
import test from "node:test";
import { vehicleRequirements } from "../vehicleRequirements.mjs";

test("vehicle evidence requirements are deterministic and unknown ownership is reviewed", () => {
  assert.deepEqual(vehicleRequirements("rider"), { drivingLicense: false, vehicleLicense: false, vehiclePhoto: true, plateVisible: true, review: false });
  assert.deepEqual(vehicleRequirements("bicycle"), { drivingLicense: false, vehicleLicense: false, vehiclePhoto: true, plateVisible: false, review: false });
  assert.equal(vehicleRequirements("car").review, true);
  assert.equal(vehicleRequirements("truck", "verified_owner").vehiclePhoto, false);
  assert.equal(vehicleRequirements("car", "not_owner").plateVisible, true);
  assert.throws(() => vehicleRequirements("van"), /invalid vehicle/);
});
