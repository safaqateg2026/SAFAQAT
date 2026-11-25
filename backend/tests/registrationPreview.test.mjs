import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessRegistrationImage } from "../../app/src/app/registrationImageQuality.ts";
import { normalizePlateDigits, normalizePlateLetters } from "../registration.mjs";

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

test("approved geographic catalog preserves all 27 governorates and 936 areas in exact order", () => {
  const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const whitelist = read("../../app/src/app/safaqatGeographicWhitelist.json");
  const records = read("../../app/src/app/safaqatApprovedAreaRecords.json");
  const governorates = read("../../app/src/app/egyptRegistrationCatalog.json");
  const source = readFileSync(new URL("../../app/src/app/registrationGeography.ts", import.meta.url), "utf8");
  const codes = new Map([...source.matchAll(/"([^"]+)"\s*:\s*"(EG\d+)"/g)].map(match => [match[1], match[2]]));

  assert.equal(Object.keys(whitelist).length, 27);
  assert.equal(Object.keys(records).length, 27);
  assert.equal(Object.values(records).flat().length, 936);
  assert.deepEqual(Object.keys(records), Object.keys(whitelist).map(name => codes.get(name)));

  for (const [name, areas] of Object.entries(whitelist)) {
    const code = codes.get(name);
    assert.ok(governorates.some(gov => gov.code === code));
    const entries = records[code];
    assert.deepEqual(entries.map(row => row.ar), areas, name);
    assert.equal(new Set(entries.map(row => row.id)).size, entries.length);

    for (const row of entries) {
      assert.deepEqual(Object.keys(row).sort(), ["aliases", "ar", "en", "id"]);
      assert.ok(row.id && row.ar);
      assert.deepEqual(row.aliases, []);
    }

    const internal = read(`../../app/public/registration-geography/area-map-v3/${code}.json`);
    assert.ok(internal.districtToArea);
    assert.ok(Array.isArray(internal.exactPoints));

    for (const item of internal.exactPoints) {
      assert.ok(item.area);
      assert.ok(item.point.every(Number.isFinite));
      assert.ok(item.point[0] >= 20 && item.point[0] <= 38);
      assert.ok(item.point[1] >= 20 && item.point[1] <= 34);
    }
  }
});

test("Egyptian plate fields normalize letters and Arabic-Indic or Western digits separately", () => {
  assert.equal(normalizePlateLetters(" س ب ي "), "سبي");
  assert.equal(normalizePlateDigits("٤٣٦٣"), "4363");
  assert.equal(normalizePlateDigits("4363"), "4363");
  assert.equal(normalizePlateDigits("۴۳۶۳"), "4363");
});
