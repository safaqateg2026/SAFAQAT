import type { RegistrationRole } from "./RegistrationPreview";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import { verificationOcrFieldMap } from "./verificationOcrMapping";

type DocumentField = { id: string; label: string };
type DocumentRecord = { kind: string; label: string; fields: DocumentField[] };

export default function VerificationDossier({ role, language, vehicleType }: { role: RegistrationRole; language: Language; vehicleType?: string }) {
  const copy = registrationMessages[language];
  const identity: DocumentRecord = { kind: "nationalIdentity", label: copy.id, fields: [
    { id: verificationOcrFieldMap.nationalIdentity.fullName, label: copy.docFullName },
    { id: verificationOcrFieldMap.nationalIdentity.identityNumber, label: copy.docIdentityNumber },
    { id: verificationOcrFieldMap.nationalIdentity.dateOfBirth, label: copy.docBirth },
    { id: verificationOcrFieldMap.nationalIdentity.registeredAddress, label: copy.docAddress },
    { id: verificationOcrFieldMap.nationalIdentity.expirationDate, label: copy.docExpiration },
  ] };
  const driving: DocumentRecord = { kind: "drivingLicense", label: copy.drivingLicense, fields: [
    { id: verificationOcrFieldMap.drivingLicense.holderName, label: copy.docHolder },
    { id: verificationOcrFieldMap.drivingLicense.licenseNumber, label: copy.docLicenseNumber },
    { id: verificationOcrFieldMap.drivingLicense.category, label: copy.docCategory },
    { id: verificationOcrFieldMap.drivingLicense.expirationDate, label: copy.docExpiration },
  ] };
  const vehicle: DocumentRecord = { kind: "vehicleLicense", label: copy.vehicleLicense, fields: [
    { id: verificationOcrFieldMap.vehicleLicense.ownerName, label: copy.docOwner },
    { id: verificationOcrFieldMap.vehicleLicense.plateLetters, label: copy.docPlateLetters },
    { id: verificationOcrFieldMap.vehicleLicense.plateDigits, label: copy.docPlateDigits },
    { id: verificationOcrFieldMap.vehicleLicense.vehicleType, label: copy.docVehicleType },
    { id: verificationOcrFieldMap.vehicleLicense.manufacturer, label: copy.docManufacturer },
    { id: verificationOcrFieldMap.vehicleLicense.model, label: copy.docModel },
    { id: verificationOcrFieldMap.vehicleLicense.color, label: copy.docColor },
    { id: verificationOcrFieldMap.vehicleLicense.chassisNumber, label: copy.docChassis },
    { id: verificationOcrFieldMap.vehicleLicense.engineNumber, label: copy.docEngine },
    { id: verificationOcrFieldMap.vehicleLicense.expirationDate, label: copy.docExpiration },
  ] };
  const documents = role === "supplier" || role === "merchant" ? [identity]
    : role === "courier" ? [identity, ...(vehicleType === "bicycle" ? [] : [driving, vehicle])] : [];
  return <div className="verification-dossier" aria-label={copy.dossier}>
    {documents.map(document => <section key={document.kind} className="verification-document" data-document-kind={document.kind}>
      <h3>{document.label}</h3>
      <p>{copy.documentCapturePreview}</p>
      {document.fields.map(field => <label className="verification-locked" key={field.id}>{field.label}<input name={field.id} data-ocr-field={field.id} readOnly value="" placeholder={copy.awaitingTrustedResult} /></label>)}
    </section>)}
    <p role="status">{copy.verificationPreviewOnly}</p>
  </div>;
}
