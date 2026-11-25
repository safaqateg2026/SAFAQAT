import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEgyptPhone } from "../../shared/egyptPhone.mjs";

const cases = [
  ["1012345678", "1012345678"],
  ["01012345678", "1012345678"],
  ["+201012345678", "1012345678"],
  ["00201012345678", "1012345678"],
  ["٠١٠١٢٣٤٥٦٧٨", "1012345678"],
  ["۰۱۰۱۲۳۴۵۶۷۸", "1012345678"],
  ["+20 101 234 5678", "1012345678"],
  ["", ""]
];

for (const [index, pair] of cases.entries()) {
  test(`Egyptian phone normalization ${index + 1}`, () => {
    assert.equal(normalizeEgyptPhone(pair[0]), pair[1]);
  });
}

test("overlong phone numbers are not silently truncated", () => {
  assert.equal(
    normalizeEgyptPhone("010123456789"),
    "10123456789"
  );
});

test("invalid input types are rejected", () => {
  assert.equal(normalizeEgyptPhone(null), "");
});
