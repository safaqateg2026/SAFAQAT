import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessRegistrationImage } from "../../app/src/app/registrationImageQuality.ts";

test("published administrative catalog matches all map polygons and governorate memberships", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../app/src/app/egyptRegistrationCatalog.json", import.meta.url)));
  const boundaries = JSON.parse(readFileSync(new URL("../../app/public/registration-geography/egy-adm2-v01.json", import.meta.url)));
  assert.equal(catalog.length, 27);
  assert.equal(boundaries.length, 365);
  const districts = new Map(catalog.flatMap(gov => gov.districts.map(district => [district.code, gov.code])));
  assert.equal(districts.size, 365);
  for (const boundary of boundaries) assert.equal(districts.get(boundary.code), boundary.parent);
});

test("sample camera rejects clear optical quality failures and accepts a sharp synthetic frame", () => {
  function sample(pattern) {
    const bytes = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 256; i++) bytes.fill(pattern(i), i * 4, i * 4 + 4);
    return bytes;
  }
  const evaluate = pattern => assessRegistrationImage(640, 480, sample(pattern), 16);
  assert.equal(assessRegistrationImage(320, 200, sample(() => 100), 16), "lowResolution");
  assert.equal(evaluate(() => 0), "tooDark");
  assert.equal(evaluate(() => 255), "tooBright");
  assert.equal(evaluate(() => 100), "tooBlurry");
  assert.equal(evaluate(i => i % 2 ? 195 : 60), null);
});
