"use client";
import businessActivities from "../../../shared/businessActivities.json";
import { useRef, useState } from "react";
import { buildConsumerRegistration } from "../../../shared/consumerRegistrationForm.mjs";
import { submitRegistration } from "../../../shared/registrationClient.mjs";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import BirthDateFields from "./BirthDateFields";
import RegistrationLocation from "./RegistrationLocation";
import RegistrationCamera from "./RegistrationCamera";
import VerificationDossier from "./VerificationDossier";
import RegistrationPlateArtwork from "./RegistrationPlateArtwork";
import SelectionList from "./SelectionList";
import OptionalImagePicker from "./OptionalImagePicker";
import { PhoneVerification, GmailVerification } from "./ContactVerification";
import ContextHelp from "./ContextHelp";
import "./RegistrationPreview.css";

export type RegistrationRole = keyof typeof registrationMessages.ar.title;

const vehicleTypes = (language: Language) => {
  const copy = registrationMessages[language];
  return [
    { value: "truck", label: copy.truck }, { value: "car", label: copy.car },
    { value: "rider", label: copy.rider }, { value: "bicycle", label: copy.bicycle },
  ];
};

export default function RegistrationPreview({ role, language, initialVehicleType = "" }: { role: RegistrationRole; language: Language; initialVehicleType?: string }) {
  const copy = registrationMessages[language];
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState("");
  const submissionLock = useRef(false);
  const registrationEnabled = false;
  const approvedPolicyVersions: Record<string, string> = {};
  const business = role === "merchant" || role === "supplier";
  const courier = role === "courier";
  const consumer = role === "consumer";
  const [vehicleType, setVehicleType] = useState(initialVehicleType);
  const [businessType, setBusinessType] = useState("");
  const businessTypes = role === "supplier"
    ? businessActivities.supplier
    : businessActivities.retailer;
  const cameraItems = [
    { key: "idFront", label: copy.idFront }, { key: "idBack", label: copy.idBack },
    { key: "faceVideo", label: copy.selfie, selfie: true, videoOnly: true },
  ];
  const vehicleItems = vehicleType && vehicleType !== "bicycle" ? [
    { key: "vehicleLicenseFront", label: copy.vehicleLicenseFront },
    { key: "vehicleLicenseBack", label: copy.vehicleLicenseBack },
    { key: "drivingLicenseFront", label: copy.drivingLicenseFront },
    { key: "drivingLicenseBack", label: copy.drivingLicenseBack },
    { key: "vehiclePhoto", label: copy.vehiclePhoto },
  ] : [];

  const policies = [copy.terms, copy.privacy, copy.commission];
  const applicablePolicies = [...policies, ...(!courier ? [copy.sales] : []), ...(courier || consumer ? [copy.deliveryPolicy] : [])];

  return (
    <form className="safaqat-registration" method="dialog" autoComplete="off" dir={language === "ar" ? "rtl" : "ltr"}
      onInput={() => {
        setChecked(false);
        setSubmissionStatus("");
      }}
      onSubmit={async event => {
        event.preventDefault();

        if (!registrationEnabled || !consumer) {
          setChecked(true);
          return;
        }

        if (submissionLock.current) return;

        const input = buildConsumerRegistration(
          new FormData(event.currentTarget),
          language,
          approvedPolicyVersions
        );

        if (!input) {
          setSubmissionStatus(language === "ar"
            ? "يرجى استكمال البيانات وتأكيد الموقع والسياسات."
            : "Complete the required fields, location and policies.");
          return;
        }

        submissionLock.current = true;
        setSubmitting(true);
        setSubmissionStatus("");

        try {
          const result = await submitRegistration(input, {
            enabled: registrationEnabled
          });

          setSubmissionStatus(result.saved
            ? (language === "ar"
              ? "تم حفظ البيانات، ولم يتم تفعيل الحساب بعد."
              : "Details saved. Account not activated.")
            : (language === "ar"
              ? "تعذر حفظ البيانات. حاول مرة أخرى."
              : "Unable to save details. Please retry."));
        } catch {
          setSubmissionStatus(language === "ar"
            ? "تعذر الاتصال بالخادم."
            : "Unable to contact the server.");
        } finally {
          submissionLock.current = false;
          setSubmitting(false);
        }
      }}>
      <fieldset className="registration-section registration-phone-section">
        <legend>{copy.phoneVerification}</legend>
        <PhoneVerification language={language} />
      </fieldset>
      <fieldset className="registration-section registration-gmail-section">
        <legend>{copy.gmailVerification}</legend>
        <GmailVerification language={language} optional />
      </fieldset>

      {consumer ? <>
        <fieldset className="registration-section registration-basic-section">
          <legend>{copy.basics}</legend>
          <label>{copy.name}<input name="fullName" required maxLength={150} /></label>
          <BirthDateFields language={language} />
          <OptionalImagePicker language={language} label={copy.addImage} name="consumerProfileImage" />
        </fieldset>
      </> : <fieldset className="registration-section registration-identity-section">
        <legend>{copy.personalVerification}</legend>
        <RegistrationCamera language={language} items={cameraItems} />
        <VerificationDossier role={role} language={language} vehicleType="" section="identity"
          afterBirth={courier ? <OptionalImagePicker language={language} label={copy.addImage} name="courierProfileImage" /> : undefined} />
      </fieldset>}

      {business && <fieldset className="registration-section registration-business-section">
        <legend>{copy.business}</legend>
        <label>{copy.businessName}<input name="businessName" required maxLength={150} /></label>
        <SelectionList label={copy.businessType} value={businessType} options={businessTypes.map(item => ({ value: item.id, label: item[language] }))}
          onChange={setBusinessType} language={language} placeholder={copy.select} required />
        <input type="hidden" name="activityCode" value={businessType} />
        <label>{copy.premises}<input name="premisesAddress" required maxLength={300} /></label>
        <label className="registration-disabled-field">{copy.commercialRegister}<input disabled value={copy.notActive} readOnly /></label>
        <label className="registration-disabled-field">{copy.taxCard}<input disabled value={language === "ar" ? "غير منشطة" : copy.notActive} readOnly /></label>
        <div className="registration-premises-images">
          <OptionalImagePicker language={language}
            label={copy.premisesExterior} name="premisesExterior" />
          <OptionalImagePicker language={language}
            label={copy.premisesInterior} name="premisesInterior" />
        </div>
        <OptionalImagePicker language={language} label={copy.businessLogo} name="businessLogo"
          defaultImage="/images/safaqat-default-business-logo.jpg" />
      </fieldset>}

      {courier && <fieldset className="registration-section registration-vehicle-section">
        <legend>{copy.vehicleVerification}</legend>
        <SelectionList id="courier-vehicle" label={copy.vehicle} value={vehicleType} options={vehicleTypes(language)}
          onChange={value => setVehicleType(value)} language={language} placeholder={copy.select} required />
        <input type="hidden" name="vehicleType" value={vehicleType} />
        {vehicleType && vehicleType !== "bicycle" && <>
          {vehicleType === "car" || vehicleType === "truck" ? <p className="registration-ownership-review" role="status">{copy.manualOwnershipReview}</p> : null}
          <RegistrationPlateArtwork key={vehicleType} editable kind={vehicleType === "rider" ? "compact" : "wide"}
            image={`/images/vehicle-plates/${vehicleType === "rider" ? "motorcycle-light-blue" : vehicleType === "car" ? "car-blue" : "transport-red"}.png`}
            alt={copy.plate} lettersLabel={copy.plateLetters} digitsLabel={copy.plateDigits} />
          <ContextHelp label={copy.help} text={copy.plateHelp} />
          <RegistrationCamera key={`vehicle-captures-${vehicleType}`} language={language} items={vehicleItems} />
          <VerificationDossier
            key={`vehicle-dossier-${vehicleType}`}
            role={role}
            language={language}
            vehicleType={vehicleType}
            section="vehicle"
          />
        </>}
      </fieldset>}

      <RegistrationLocation language={language} />
      {!consumer && <div className="registration-coverage"><strong>{copy.coverage}</strong><p>{copy.coverageHint}</p></div>}
      <fieldset className="registration-section registration-policies-section">
        <legend>{copy.policies}</legend>
        <ul>{applicablePolicies.map(policy => <li key={policy}>{policy}</li>)}</ul>
        <p>{copy.policyHint}</p>
      </fieldset>
      <p className="registration-preview-warning" role="note">{copy.preview}</p>
      <button type="submit" disabled={submitting}>{copy.validate}</button>
      <p role="status">{submissionStatus || (checked ? copy.previewValidationOnly : "")}</p>
    </form>
  );
}
