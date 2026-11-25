import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../app/src/app/RegistrationLocation.tsx", import.meta.url),
  "utf8"
);

test("registration exposes named location fields", () => {
  for (const name of [
    "address",
    "governorateCode",
    "districtCode",
    "latitude",
    "longitude"
  ]) {
    assert.ok(source.includes(`name="${name}"`));
  }
});

test("coordinates require a confirmed location and locality", () => {
  assert.ok(source.includes(
    '!open && confirmed && locality ? confirmed.point[1] : ""'
  ));
  assert.ok(source.includes(
    '!open && confirmed && locality ? confirmed.point[0] : ""'
  ));
});

test("address changes invalidate confirmed coordinates", () => {
  assert.match(
    source,
    /setAddress\(event\.target\.value\);\s*setConfirmed\(undefined\);/
  );
});

test("locality changes invalidate confirmed coordinates", () => {
  assert.match(
    source,
    /setLocality\(id\);\s*setConfirmed\(undefined\);/
  );
});
