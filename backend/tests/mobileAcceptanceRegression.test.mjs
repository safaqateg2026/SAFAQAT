import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = file => readFile(path.join(root, file), "utf8");

test("the approved selectable geography remains complete and unique", async () => {
  const governors = JSON.parse(await read("app/src/app/safaqatGeographicWhitelist.json"));
  const catalog = JSON.parse(await read("app/src/app/safaqatApprovedAreaRecords.json"));
  assert.equal(Object.keys(governors).length, 27);
  assert.equal(Object.keys(catalog).length, 27);
  assert.equal(Object.values(catalog).flat().length, 936);
  for (const rows of Object.values(catalog)) {
    const ids = rows.map(record => record.id);
    assert.equal(new Set(ids).size, ids.length, "area IDs must be unique within each governorate");
  }
});

test("vehicle labels and unified selection preserve approved IDs", async () => {
  const messages = await read("app/src/app/registrationMessages.ts");
  const form = await read("app/src/app/RegistrationPreview.tsx");

  for (const label of [
    "سيارة نقل", "سيارة ملاكي", "موتسيكل/تروسيكل", "عجلة/دراجة",
    "Transport vehicle", "Private car", "Motorcycle / Motorized tricycle", "Bicycle"
  ]) assert.ok(messages.includes(label));

  assert.match(form, /value: "truck"[\s\S]*value: "car"[\s\S]*value: "rider"[\s\S]*value: "bicycle"/);
  assert.match(form, /<SelectionList id="courier-vehicle"/);
});


test("plate artwork supports manual entry and responsive original artwork", async () => {
  const component = await read("app/src/app/RegistrationPlateArtwork.tsx");
  const form = await read("app/src/app/RegistrationPreview.tsx");
  const css = await read("app/src/app/RegistrationPreview.css");
  const fixture = await read("app/src/app/registration-fixture/plates/page.tsx");

  assert.match(component, /name="plateLetters"/);
  assert.match(component, /name="plateDigits"/);
  assert.match(component, /normalizePlateLetters\(event.target.value\)/);
  assert.match(component, /normalizePlateDigits\(event.target.value\)/);
  assert.match(component, /className="plate-letters"/);
  assert.match(component, /className="plate-digits"/);
  assert.match(component, /\{editable &&/);
  assert.match(form, /<RegistrationPlateArtwork key=\{vehicleType\} editable/);
  assert.match(form, /vehicleType && vehicleType !== "bicycle"/);

  assert.match(css, /registration-plate-art \{[^}]*aspect-ratio: 1774 \/ 887/);
  assert.match(css, /wide \.plate-letters \{ inset: 50% 3\.5% 14% 51\.5%; \}/);
  assert.match(css, /wide \.plate-digits \{ inset: 50% 51\.5% 14% 3\.5%; \}/);
  assert.match(css, /compact \.plate-letters \{ inset: 40% 13% 40%;/);
  assert.match(css, /compact \.plate-digits \{ inset: 66% 13% 10%;/);

  assert.match(fixture, /RegistrationPlateArtwork/);

  const { createHash } = await import("node:crypto");
  const hashes = {
    "transport-red.png": "3c65824887a4087dc13bc89ac197bfad8d707d03be273922dc7c5967900a8cf2",
    "car-blue.png": "0ca73a92e426df67b30a15bef848259301b5a2df86a35d862d749731292ab589",
    "motorcycle-light-blue.png": "b865fbe6c18fe3148705118e0a6fecad27f626e0adb3ccc8537090dac5c63512"
  };

  for (const [file, expected] of Object.entries(hashes)) {
    const data = await readFile(path.join(root, "app/public/images/vehicle-plates", file));
    assert.equal(createHash("sha256").update(data).digest("hex"), expected);
  }
});


test("locality clear control stays inside the field and clears dependent selections", async () => {
  const [picker, form, css] = await Promise.all([
    read("app/src/app/RegistrationLocalityPicker.tsx"), read("app/src/app/RegistrationLocation.tsx"), read("app/src/app/RegistrationPreview.css"),
  ]);
  assert.match(picker, /className="registration-locality-input"[\s\S]*className="registration-locality-clear"/);
  assert.match(picker, /onSelect\(""\)/);
  assert.match(css, /registration-locality-clear \{ position: absolute;[\s\S]*inset-inline-end:/);
  assert.match(css, /::-webkit-search-cancel-button \{ -webkit-appearance: none; appearance: none; display: none; \}/);
  assert.match(form, /setGovernorate\(id\);\s*setLocality\(""\);/);
});

test("business photos and logo remain separate optional controls", async () => {
  const form = await read("app/src/app/RegistrationPreview.tsx");
  const messages = await read("app/src/app/registrationMessages.ts");

  assert.match(form, /role === "merchant" \|\| role === "supplier"/);
  assert.match(form, /\{business && <fieldset[\s\S]*name="premisesExterior"[\s\S]*name="premisesInterior"/);
  assert.match(messages, /premisesExterior: "صورة النشاط من الخارج"/);
  assert.match(messages, /premisesInterior: "صورة النشاط من الداخل"/);
  assert.doesNotMatch(form, /premisesExterior[^\n]*required|premisesInterior[^\n]*required/);
  assert.match(form, /defaultImage="\/images\/safaqat-default-business-logo.jpg"/);
});


test("identity and face previews cannot capture real sensitive data", async () => {
  const camera = await read("app/src/app/RegistrationCamera.tsx");
  const css = await read("app/src/app/RegistrationPreview.css");
  const messages = await read("app/src/app/registrationMessages.ts");

  assert.match(camera, /data-capture-interface="preview-only"/);
  assert.match(camera, /copy\.faceCaptureLabel/);
  assert.match(camera, /copy\.faceManualStep/);
  assert.match(camera, /copy\.syntheticPreviewOnly/);
  assert.match(camera, /copy\.captureUnavailable/);
  assert.match(camera, /scrollIntoView/);
  assert.doesNotMatch(camera, /getUserMedia|MediaRecorder|takePhoto|toDataURL|toBlob/);
  assert.match(css, /registration-frame-selfie \{ inline-size: min\(56%, 28rem\); aspect-ratio: \.82; border-radius: 50%; \}/);
  assert.match(messages, /faceCaptureLabel: "معاينة فيديو الوجه فقط/);
});


test("courier identity and vehicle controls follow the updated order", async () => {
  const form = await read("app/src/app/RegistrationPreview.tsx");
  const camera = await read("app/src/app/RegistrationCamera.tsx");

  const identity = form.match(/const cameraItems = \[([\s\S]*?)\n  \];/)?.[1] ?? "";
  const vehicle = form.match(/const vehicleItems = ([\s\S]*?)\] : \[\];/)?.[1] ?? "";

  function ordered(block, keys) {
    let cursor = -1;
    for (const key of keys) {
      const next = block.indexOf(`key: "${key}"`, cursor + 1);
      assert.ok(next > cursor, `Missing or misplaced control: ${key}`);
      cursor = next;
    }
  }

  ordered(identity, ["idFront", "idBack", "faceVideo"]);
  ordered(vehicle, [
    "vehicleLicenseFront", "vehicleLicenseBack",
    "drivingLicenseFront", "drivingLicenseBack", "vehiclePhoto"
  ]);

  assert.match(form, /vehicleType !== "bicycle"/);
  assert.match(form, /key=\{`vehicle-captures-\$\{vehicleType\}`\}/);
  assert.match(form, /name="courierProfileImage"/);
  assert.match(form, /copy\.manualOwnershipReview/);
  assert.match(camera, /registration-capture-full/);
  assert.doesNotMatch(camera, /setAcceptedKeys|capture-success-indicator/);
});


test("visual acceptance fixture can render each vehicle through the production registration component", async () => {
  const [fixture, form] = await Promise.all([read("app/src/app/registration-fixture/form/page.tsx"), read("app/src/app/RegistrationPreview.tsx")]);
  assert.match(fixture, /const \[vehicleType, setVehicleType\] = useState\("car"\)/);
  assert.match(fixture, /value="rider"[\s\S]*value="car"[\s\S]*value="truck"[\s\S]*value="bicycle"/);
  assert.match(fixture, /initialVehicleType=\{vehicleType\}/);
  assert.match(form, /useState\(initialVehicleType\)/);
});

test("trusted OCR mappings remain locked and separate from manual plates", async () => {
  const mapping = await read("app/src/app/verificationOcrMapping.ts");
  const dossier = await read("app/src/app/VerificationDossier.tsx");
  const form = await read("app/src/app/RegistrationPreview.tsx");
  const artwork = await read("app/src/app/RegistrationPlateArtwork.tsx");
  const messages = await read("app/src/app/registrationMessages.ts");

  for (const key of [
    "fullName", "identityNumber", "dateOfBirth", "registeredAddress",
    "expirationDate", "holderName", "licenseNumber", "category",
    "ownerName", "plateLetters", "plateDigits", "vehicleType",
    "manufacturer", "model", "color", "chassisNumber", "engineNumber"
  ]) {
    assert.match(mapping, new RegExp(`${key}: "(?:nationalIdentity|drivingLicense|vehicleLicense)\\.${key}"`));
  }

  assert.match(dossier, /data-ocr-field/);
  assert.match(dossier, /readOnly/);
  assert.match(form, /<RegistrationPlateArtwork key=\{vehicleType\} editable/);
  assert.match(artwork, /letters = "", digits = ""/);
  assert.match(messages, /id: "البطاقة الشخصية"/);
  assert.match(messages, /id: "National identity card"/);
  assert.match(messages, /Official verification and data extraction are unavailable/);
});


test("manual plate and consumer date validation reject malformed values", async () => {
  const {
    normalizePlateLetters,
    normalizePlateDigits,
    validatePlate,
    isValidConsumerDate
  } = await import("../../shared/registrationRules.mjs");

  assert.equal(normalizePlateLetters("Aس1م!د"), "سمد");
  assert.equal(normalizePlateDigits("0123"), "٠١٢٣");
  assert.equal(normalizePlateDigits("۰۱۲۳"), "٠١٢٣");
  assert.equal(validatePlate("سمد", "0123", "truck"), true);
  assert.equal(validatePlate("سمد", "٠١٢٣", "car"), true);
  assert.equal(validatePlate("Aس", "1234", "car"), false);
  assert.equal(validatePlate("سمدب", "1234", "truck"), false);
  assert.equal(validatePlate("سمد", "12345", "truck"), false);
  assert.equal(validatePlate("", "", "bicycle"), true);
  assert.equal(validatePlate("A", "", "bicycle"), false);
  assert.equal(isValidConsumerDate(2000, 2, 29, "2026-11-25"), true);
  assert.equal(isValidConsumerDate(2001, 2, 29, "2026-11-25"), false);
  assert.equal(isValidConsumerDate(2012, 1, 1, "2026-11-25"), false);
  assert.equal(isValidConsumerDate(2000, 2, 1.5, "2026-11-25"), false);
});
