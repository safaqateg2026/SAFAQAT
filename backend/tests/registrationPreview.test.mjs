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

test("curated area catalogs stay separate from internal GIS and cover the required accepted names", () => {
  const governorates = JSON.parse(readFileSync(new URL("../../app/src/app/egyptRegistrationCatalog.json", import.meta.url)));
  const normalize = value => value.toLocaleLowerCase("ar-EG").normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/[ىةؤئ]/g, ch => ({"ى":"ي","ة":"ه","ؤ":"و","ئ":"ي"})[ch])
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const names = new Map();
  assert.equal(governorates.length, 27);
  for (const governorate of governorates) {
    const entries = JSON.parse(readFileSync(new URL(`../../app/public/registration-geography/areas-v3/${governorate.code}.json`, import.meta.url)));
    const internal = JSON.parse(readFileSync(new URL(`../../app/public/registration-geography/area-map-v3/${governorate.code}.json`, import.meta.url)));
    assert.ok(entries.length > 0, governorate.code);
    assert.equal(new Set(entries.map(row => row.id)).size, entries.length, governorate.code);
    assert.equal(new Set(entries.map(row => normalize(row.ar))).size, entries.length, `${governorate.code}: duplicate visible names`);
    assert.ok(Object.keys(internal.districtToArea).length > 0, `${governorate.code}: missing internal mapping`);
    const ids = new Set(entries.map(row => row.id));
    for (const row of entries) {
      assert.deepEqual(Object.keys(row).sort(), ["aliases", "ar", "en", "id"], `${governorate.code}: raw source metadata leaked`);
      assert.ok(row.ar && row.en, `${governorate.code}: missing localized name`);
      assert.ok(!/^(?:قسم|مركز|إدارة شرطة|اداره شرطه)|\b(?:شرق|غرب|شمال|جنوب)$/.test(row.ar), `${governorate.code}: administrative suffix`);
      assert.ok(!/(?:أبراج|ابراج|عمارة|كمبوند|مساكن|شرطة|ميناء)/u.test(row.ar), `${governorate.code}: disallowed feature`);
      names.set(`${governorate.code}:${normalize(row.ar)}`, row.ar);
    }
    for (const area of Object.values(internal.districtToArea)) assert.ok(ids.has(area), `${governorate.code}: mapping points outside curated catalog`);
    for (const item of internal.exactPoints) {
      assert.ok(ids.has(item.area), `${governorate.code}: GPS point lacks curated parent`);
      assert.ok(item.point[0] >= 20 && item.point[0] <= 38 && item.point[1] >= 20 && item.point[1] <= 34, `${governorate.code}: GPS coordinate outside Egypt`);
    }
  }
  const alex = [...names.entries()].filter(([key]) => key.startsWith("EG02:")).map(([, value]) => normalize(value));
  const beh = [...names.entries()].filter(([key]) => key.startsWith("EG18:")).map(([, value]) => normalize(value));
  for (const item of ["ابراج القاهرة", "ابراج المعتز"]) assert.ok(![...names.values()].map(normalize).includes(normalize(item)), item);
  for (const item of ["دمنهور", "أبو حمص", "كفر الدوار", "إدكو", "رشيد", "حوش عيسى", "أبو المطامير", "كوم حمادة", "الدلنجات", "إيتاي البارود", "شبراخيت", "المحمودية", "الرحمانية"])
    assert.ok(beh.includes(normalize(item)), `Beheira area missing: ${item}`);
  for (const item of ["سيدي جابر", "سيدي بشر", "سبورتنج", "الإبراهيمية", "محطة الرمل", "المنشية", "الورديان", "المكس", "الدخيلة", "البيطاش", "الهانوفيل", "الكيلو 21", "أبو تلات", "العطارين", "السيوف", "السيوف شماعة", "الرأس السوداء", "الطابية", "العصافرة", "المندرة", "ميامي", "سموحة", "محرم بك", "أبو قير", "أبو يوسف", "الصفا والمروة"])
    assert.ok(alex.includes(normalize(item)), `Alexandria area missing: ${item}`);
  for (const item of ["البيطاش شرق", "البيطاش غرب", "أبو قير الشرقية", "أبو قير الغربية"]) {
    assert.ok(!alex.includes(normalize(item)), `unmerged area exposed: ${item}`);
  }
  assert.equal(alex.filter(name => name === normalize("البيطاش")).length, 1);
  assert.equal(alex.filter(name => name === normalize("أبو قير")).length, 1);
  assert.equal(alex.filter(name => name === normalize("الدخيلة")).length, 1);
});
