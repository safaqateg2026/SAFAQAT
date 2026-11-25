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

test("vehicle labels preserve IDs and use the approved Arabic and English labels", async () => {
  const [messages, form] = await Promise.all([read("app/src/app/registrationMessages.ts"), read("app/src/app/RegistrationPreview.tsx")]);
  assert.match(messages, /rider: "موتسيكل\/تروسيكل", car: "سيارة ملاكي", truck: "سيارة نقل", bicycle: "عجلة \/ دراجة"/);
  assert.match(messages, /rider: "Motorcycle \/ Motorized tricycle", car: "Private car", truck: "Transport vehicle", bicycle: "Bicycle"/);
  assert.match(form, /<option value="rider">[\s\S]*?<option value="car">[\s\S]*?<option value="truck">[\s\S]*?<option value="bicycle">/);
});

test("plate output is read-only text using unmodified source artwork and responsive positions", async () => {
  const [component, form, css, fixture] = await Promise.all([
    read("app/src/app/RegistrationPlateArtwork.tsx"), read("app/src/app/RegistrationPreview.tsx"),
    read("app/src/app/RegistrationPreview.css"), read("app/src/app/registration-fixture/plates/page.tsx"),
  ]);
  assert.doesNotMatch(component, /<input/);
  assert.match(component, /<span className="plate-letters"/);
  assert.match(component, /<span className="plate-digits"/);
  assert.match(form, /<RegistrationPlateArtwork/);
  assert.doesNotMatch(form, /letters="|digits="/);
  assert.match(css, /registration-plate-art \{[^}]*aspect-ratio: 1774 \/ 887/);
  assert.match(css, /wide \.plate-letters \{ inset: 50% 3\.5% 14% 51\.5%; \}/);
  assert.match(css, /wide \.plate-digits \{ inset: 50% 51\.5% 14% 3\.5%; \}/);
  assert.match(css, /compact \.plate-letters \{ inset: 40% 13% 40%;/);
  assert.match(css, /compact \.plate-digits \{ inset: 66% 13% 10%;/);
  assert.match(fixture, /RegistrationPlateArtwork/);
  assert.match(fixture, /letters="س ب ي" digits="٤٣٦٣"/);
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

test("supplier and merchant premises photos are separately optional controls", async () => {
  const [form, messages] = await Promise.all([read("app/src/app/RegistrationPreview.tsx"), read("app/src/app/registrationMessages.ts")]);
  assert.match(form, /business \? \[[\s\S]*key: "premisesExterior", label: copy\.premisesExterior, optional: true[\s\S]*key: "premisesInterior", label: copy\.premisesInterior, optional: true/);
  assert.match(messages, /premisesExterior: "صورة واجهة النشاط من الخارج"/);
  assert.match(messages, /premisesInterior: "صورة النشاط من الداخل"/);
  assert.match(messages, /premisesExterior: "Exterior business premises photo"/);
  assert.match(messages, /premisesInterior: "Interior business premises photo"/);
  assert.match(messages, /optionalPhoto: "Optional and does not affect registration completion/);
  assert.doesNotMatch(form, /premisesExterior[^\n]*required|premisesInterior[^\n]*required/);
});

test("face prompts are previews only and there is no face frame capture", async () => {
  const [camera, css, messages] = await Promise.all([
    read("app/src/app/RegistrationCamera.tsx"), read("app/src/app/RegistrationPreview.css"), read("app/src/app/registrationMessages.ts"),
  ]);
  assert.match(camera, /\{!item\.selfie && !item\.videoOnly && !preview && <button[^>]*onClick=\{takePhoto\}/);
  assert.match(camera, /copy\.faceCaptureLabel/);
  assert.match(camera, /copy\.faceManualStep/);
  assert.match(css, /registration-frame-selfie \{ inline-size: min\(56%, 28rem\); aspect-ratio: \.82; border-radius: 50%; \}/);
  assert.match(css, /inset-inline-start: auto;\s*left: 50%;/);
  assert.match(messages, /faceCaptureLabel: "Face video preview only/);
  assert.match(messages, /faceCaptureLabel: "معاينة فيديو الوجه فقط/);
});

test("courier capture controls preserve the required order and success status is per sample", async () => {
  const [form, camera, css, messages] = await Promise.all([
    read("app/src/app/RegistrationPreview.tsx"), read("app/src/app/RegistrationCamera.tsx"),
    read("app/src/app/RegistrationPreview.css"), read("app/src/app/registrationMessages.ts"),
  ]);
  const orderedKeys = ["idFront", "idBack", "vehicleLicenseFront", "vehicleLicenseBack", "drivingLicenseFront", "drivingLicenseBack", "faceVideo"];
  const vehicleBlock = form.match(/const cameraItems = \[([\s\S]*?)\n  \];/)?.[1] ?? "";
  let cursor = -1;
  for (const key of orderedKeys) {
    const next = vehicleBlock.indexOf(`key: "${key}"`, cursor + 1);
    assert.ok(next > cursor, `expected ${key} in the ordered courier capture controls`);
    cursor = next;
  }
  assert.match(camera, /acceptedKeys\.has\(option\.key\)/);
  assert.match(camera, /assessRegistrationImage\([\s\S]*?if \(issue\) \{ setError\(issue\); return; \}/);
  assert.match(camera, /setAcceptedKeys\(previous => new Set\(previous\)\.add\(completedItem\.key\)\)/);
  assert.match(camera, /capture-success-indicator/);
  assert.match(css, /capture-success-indicator[^}]*background: #16803c;[^}]*color: #fff/);
  assert.match(css, /registration-actions:has\(\.registration-capture-option\)[^{]*\{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  for (const label of ["صورة وجه البطاقة الشخصية", "صورة ظهر البطاقة الشخصية", "صورة وجه رخصة المركبة", "صورة ظهر رخصة المركبة", "صورة وجه رخصة القيادة", "صورة ظهر رخصة القيادة", "تصوير فيديو حيوي للوجه"]) {
    assert.ok(messages.includes(label), `missing requested Arabic capture label: ${label}`);
  }
  assert.match(form, /vehicleType !== "bicycle" && \["car", "truck"\]/);
});

test("visual acceptance fixture can render each vehicle through the production registration component", async () => {
  const [fixture, form] = await Promise.all([read("app/src/app/registration-fixture/form/page.tsx"), read("app/src/app/RegistrationPreview.tsx")]);
  assert.match(fixture, /const \[vehicleType, setVehicleType\] = useState\("car"\)/);
  assert.match(fixture, /value="rider"[\s\S]*value="car"[\s\S]*value="truck"[\s\S]*value="bicycle"/);
  assert.match(fixture, /initialVehicleType=\{vehicleType\}/);
  assert.match(form, /useState\(initialVehicleType\)/);
});

test("document OCR fields have stable read-only mappings and feed the plate artwork", async () => {
  const [mapping, dossier, form, artwork, messages] = await Promise.all([
    read("app/src/app/verificationOcrMapping.ts"), read("app/src/app/VerificationDossier.tsx"),
    read("app/src/app/RegistrationPreview.tsx"), read("app/src/app/RegistrationPlateArtwork.tsx"), read("app/src/app/registrationMessages.ts"),
  ]);
  for (const key of ["fullName", "identityNumber", "dateOfBirth", "registeredAddress", "expirationDate", "holderName", "licenseNumber", "category", "ownerName", "plateLetters", "plateDigits", "vehicleType", "manufacturer", "model", "color", "chassisNumber", "engineNumber"]) {
    assert.match(mapping, new RegExp(`${key}: "(?:nationalIdentity|drivingLicense|vehicleLicense)\\.${key}"`));
  }
  assert.match(dossier, /data-ocr-field=\{field\.id\} readOnly value=""/);
  assert.match(mapping, /plateLetters\?: string;[\s\S]*plateDigits\?: string/);
  assert.match(mapping, /letters: fields\?\.plateLetters \?\? "",[\s\S]*digits: fields\?\.plateDigits \?\? ""/);
  assert.match(form, /mapTrustedVehiclePlate\(\)/);
  assert.match(artwork, /letters = "", digits = ""/);
  assert.match(messages, /id: "البطاقة الشخصية"/);
  assert.match(messages, /id: "National identity card"/);
  assert.match(messages, /Official verification and data extraction are unavailable/);
});
