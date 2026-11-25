import type { RegistrationRole } from "./RegistrationPreview";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";

type DocumentRecord = { kind: string; label: string; fields: string[] };

export default function VerificationDossier({ role, language }: { role: RegistrationRole; language: Language }) {
  const copy = registrationMessages[language];
  const identity: DocumentRecord = { kind: "nationalIdentity", label: copy.id, fields: [copy.docFullName, copy.docIdentityNumber, copy.docBirth, copy.docAddress, copy.docExpiration] };
  const driving: DocumentRecord = { kind: "drivingLicense", label: copy.drivingLicense, fields: [copy.docHolder, copy.docLicenseNumber, copy.docCategory, copy.docExpiration] };
  const vehicle: DocumentRecord = { kind: "vehicleLicense", label: copy.vehicleLicense, fields: [copy.docOwner, copy.docPlateLetters, copy.docPlateDigits, copy.docVehicleType, copy.docManufacturer, copy.docModel, copy.docColor, copy.docChassis, copy.docEngine, copy.docExpiration] };
  const documents = role === "supplier" ? [identity] : role === "courier" ? [identity, driving, vehicle] : [];
  return <div className="verification-dossier" aria-label={copy.dossier}>
    {documents.map(document => <section key={document.kind} className="verification-document" data-document-kind={document.kind}>
      <h3>{document.label}</h3>
      <p>{copy.documentCapturePreview}</p>
      {document.fields.map(field => <label className="verification-locked" key={field}>{field}<input readOnly value="" placeholder={copy.awaitingTrustedResult} /></label>)}
    </section>)}
    <p role="status">{copy.verificationPreviewOnly}</p>
  </div>;
}
