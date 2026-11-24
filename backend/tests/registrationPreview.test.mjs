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

test("corrected governorate catalogs contain only sourced locality records and reject apartment towers", () => {
  const governorates = JSON.parse(readFileSync(new URL("../../app/src/app/egyptRegistrationCatalog.json", import.meta.url)));
  const allowedKinds = new Set(["city", "town", "village", "hamlet", "suburb", "neighbourhood", "quarter", "isolated_dwelling", "settlement"]);
  const allNames = [];
  assert.equal(governorates.length, 27);
  for (const governorate of governorates) {
    const entries = JSON.parse(readFileSync(new URL(`../../app/public/registration-geography/localities-v2/${governorate.code}.json`, import.meta.url)));
    assert.ok(entries.length > 0, governorate.code);
    assert.equal(new Set(entries.map(row => row.id)).size, entries.length, governorate.code);
    assert.ok(entries.some(row => row.source === "capmas"), governorate.code);
    assert.ok(entries.some(row => row.source === "osm"), governorate.code);
    for (const row of entries) {
      assert.ok(allowedKinds.has(row.kind), `${governorate.code}: ${row.id} kind`);
      assert.ok(!row.mappedArea && !row.ring, `${governorate.code}: map polygon in picker`);
      assert.ok(row.ar || row.en, `${governorate.code}: unnamed record`);
      assert.ok(!row.point || (row.point[0] >= 20 && row.point[0] <= 38 && row.point[1] >= 20 && row.point[1] <= 34), `${governorate.code}: invalid coordinates`);
      allNames.push(row.ar, row.en, ...(row.aliases ?? []));
    }
  }
  const normalize = value => value.toLocaleLowerCase("ar-EG").normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/[ىةؤئ]/g, ch => ({"ى":"ي","ة":"ه","ؤ":"و","ئ":"ي"})[ch])
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const names = new Set(allNames.filter(Boolean).map(normalize));
  for (const item of ["ابراج القاهرة", "ابراج المعتز"]) assert.ok(!names.has(normalize(item)), item);
  for (const item of ["دمنهور", "أبو حمص", "كفر الدوار", "إدكو", "رشيد", "حوش عيسى", "أبو المطامير", "كوم حمادة", "الدلنجات", "إيتاي البارود", "شبراخيت", "المحمودية", "الرحمانية"])
    assert.ok(names.has(normalize(item)), `Beheira locality missing: ${item}`);
  for (const item of ["سيدي جابر", "سيدي بشر", "سبورتنج", "الإبراهيمية", "محطة الرمل", "المنشية", "الورديان", "المكس", "الدخيلة", "البيطاش", "الهانوفيل", "الكيلو 21", "أبو تلات", "العطارين", "السيوف", "السيوف شماعة", "الرأس السوداء", "الطابية", "العصافرة", "المندرة", "ميامي", "سموحة", "محرم بك", "أبو قير", "أبو يوسف", "الصفا والمروة"])
    assert.ok(names.has(normalize(item)), `Alexandria locality missing: ${item}`);
});
