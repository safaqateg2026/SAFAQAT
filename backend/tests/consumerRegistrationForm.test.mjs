import test from "node:test";
import assert from "node:assert/strict";
import { buildConsumerRegistration } from "../../shared/consumerRegistrationForm.mjs";

const policies = Object.fromEntries(
  ["terms", "privacy", "commission",
   "sales_purchase", "delivery"]
    .map(key => [key, "synthetic-v1"])
);

function form() {
  const data = new FormData();

  for (const [key, value] of Object.entries({
    fullName: "Synthetic Test",
    phone: "+201000000001",
    consumerBirthDate: "1990-01-01",
    governorateCode: "synthetic-governorate",
    districtCode: "synthetic-district",
    address: "Synthetic address",
    latitude: "31.2",
    longitude: "29.9"
  })) data.set(key, value);

  return data;
}

test("consumer payload contains expected fields", () => {
  const result = buildConsumerRegistration(form(), "ar", policies);
  assert.equal(result.role, "consumer");
  assert.equal(result.latitude, 31.2);
  assert.equal(result.longitude, 29.9);
  assert.equal(result.birthDate, "1990-01-01");
});

test("missing coordinates are rejected", () => {
  const data = form();
  data.set("latitude", "");
  assert.equal(buildConsumerRegistration(data, "ar", policies), null);
});

test("invalid coordinates are rejected", () => {
  const data = form();
  data.set("longitude", "999");
  assert.equal(buildConsumerRegistration(data, "ar", policies), null);
});

test("missing policies block submission", () => {
  assert.equal(buildConsumerRegistration(form(), "ar", {}), null);
});

test("invalid phone blocks submission", () => {
  const data = form();
  data.set("phone", "123");
  assert.equal(buildConsumerRegistration(data, "ar", policies), null);
});

test("missing locality blocks submission", () => {
  const data = form();
  data.delete("districtCode");
  assert.equal(buildConsumerRegistration(data, "ar", policies), null);
});

test("client cannot assign privileged account fields", () => {
  const data = form();
  data.set("role", "administrator");
  data.set("state", "active");
  data.set("phoneVerified", "true");

  const result = buildConsumerRegistration(data, "ar", policies);

  assert.equal(result.role, "consumer");
  assert.equal(result.state, undefined);
  assert.equal(result.phoneVerified, undefined);
});
