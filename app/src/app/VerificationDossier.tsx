import { Fragment } from "react";
import type { ReactNode } from "react";
import type { RegistrationRole } from "./RegistrationPreview";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import { verificationOcrFieldMap } from "./verificationOcrMapping";
import ContextHelp from "./ContextHelp";

type DocumentField = { id: string; label: string; date?: boolean };
type DocumentRecord = { kind: string; label: string; fields: DocumentField[] };

export default function VerificationDossier({ role, language, vehicleType, afterBirth, section = "all" }:
  { role: RegistrationRole; language: Language; vehicleType?: string; afterBirth?: ReactNode; section?: "identity" | "vehicle" | "all" }) {
  const copy = registrationMessages[language];
  const identity: DocumentRecord = { kind: "nationalIdentity", label: copy.id, fields: [
    { id: verificationOcrFieldMap.nationalIdentity.fullName, label: copy.docFullName },
    { id: verificationOcrFieldMap.nationalIdentity.identityNumber, label: copy.docIdentityNumber },
    { id: verificationOcrFieldMap.nationalIdentity.dateOfBirth, label: copy.birth, date: true },
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
    : role === "courier" ? [identity, ...(vehicleType && vehicleType !== "bicycle" ? [vehicle, driving] : [])] : [];
  return <div className="verification-dossier" aria-label={copy.dossier}>
    {documents.filter(document =>
      section === "all" ||
      (section === "identity"
        ? document.kind === "nationalIdentity"
        : document.kind !== "nationalIdentity")
    ).map(document => <section key={document.kind} className="verification-document" data-document-kind={document.kind}>
      {document.kind !== "nationalIdentity" && <h3>{document.label}</h3>}
      {document.fields.map(field => <Fragment key={field.id}><div className={`verification-field${field.date ? " verification-birth-field" : ""}`} key={field.id}>
        <label className="verification-locked">{field.label}<input name={field.id} data-ocr-field={field.id} readOnly tabIndex={-1} inputMode="none" value="" placeholder={copy.automatic} aria-readonly="true" /></label>
        {field.date && <span className="verification-date-lock" aria-hidden="true">▣</span>}
        <ContextHelp label={copy.help} text={copy.extractedFieldHelp} />
      </div>
      {field.id === verificationOcrFieldMap.nationalIdentity.dateOfBirth && afterBirth}
      </Fragment>)}
    </section>)}
    <p role="note" className="verification-preview-note">{copy.verificationPreviewOnly}</p>
  </div>;
}
