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
  assert.match(camera, /\{!item\.selfie && !preview && <button[^>]*onClick=\{takePhoto\}/);
  assert.match(camera, /copy\.faceCaptureLabel/);
  assert.match(camera, /copy\.faceManualStep/);
  assert.match(css, /registration-frame-selfie \{ inline-size: min\(56%, 28rem\); aspect-ratio: \.82; border-radius: 50%; \}/);
  assert.match(css, /inset-inline-start: auto;\s*left: 50%;/);
  assert.match(messages, /faceCaptureLabel: "Face video preview only/);
  assert.match(messages, /faceCaptureLabel: "معاينة فيديو الوجه فقط/);
});
