import { useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import BirthDateFields from "./BirthDateFields";
import RegistrationLocation from "./RegistrationLocation";
import RegistrationCamera from "./RegistrationCamera";
import VerificationDossier from "./VerificationDossier";
import RegistrationPlateArtwork from "./RegistrationPlateArtwork";
import { mapTrustedVehiclePlate } from "./verificationOcrMapping";
import "./RegistrationPreview.css";

export type RegistrationRole = keyof typeof registrationMessages.ar.title;

export default function RegistrationPreview({ role, language, initialVehicleType = "" }: { role: RegistrationRole; language: Language; initialVehicleType?: string }) {
  const copy = registrationMessages[language];
  const [checked, setChecked] = useState(false);
  const business = role === "merchant" || role === "supplier";
  const courier = role === "courier";
  const consumer = role === "consumer";
  const [vehicleType, setVehicleType] = useState(initialVehicleType);
  const cameraItems = [
    { key: "idFront", label: copy.idFront }, { key: "idBack", label: copy.idBack },
    ...(courier && vehicleType !== "bicycle" && ["car", "truck"].includes(vehicleType) ? [
      { key: "vehicleLicenseFront", label: copy.vehicleLicenseFront },
      { key: "vehicleLicenseBack", label: copy.vehicleLicenseBack },
      { key: "drivingLicenseFront", label: copy.drivingLicenseFront },
      { key: "drivingLicenseBack", label: copy.drivingLicenseBack },
    ] : []),
    { key: "faceVideo", label: copy.selfie, selfie: true, videoOnly: true },
    ...(business ? [
      { key: "premisesExterior", label: copy.premisesExterior, optional: true },
      { key: "premisesInterior", label: copy.premisesInterior, optional: true },
    ] : []),
    ...(courier && ["rider", "bicycle"].includes(vehicleType) ? [{
      key: "vehiclePhoto", label: vehicleType === "rider" ? `${copy.vehiclePhoto} · ${copy.plateVisible}` : copy.vehiclePhoto,
    }] : []),
    ...(courier && ["car", "truck"].includes(vehicleType) ? [
      { key: "vehiclePhoto", label: `${copy.vehiclePhoto} · ${copy.manualOwnershipReview}` },
    ] : []),
  ];
  const policies = [copy.terms, copy.privacy, copy.commission];
  const applicablePolicies = [...policies, ...(!courier ? [copy.sales] : []), ...(courier || consumer ? [copy.deliveryPolicy] : [])];

  return (
    <form className="safaqat-registration" method="dialog" autoComplete="off"
      onInput={() => setChecked(false)}
      onSubmit={event => { event.preventDefault(); setChecked(true); }}>
      <fieldset>
        <legend>{copy.basics}</legend>
        <label>{copy.name}{role === "consumer" ? <input required maxLength={150} /> : <input readOnly value="" placeholder={copy.awaitingTrustedResult} />}</label>
        <label>{copy.phone}<input required type="tel" dir="ltr" pattern="\+201[0-9]{9}" maxLength={13} /></label>
        <label>{consumer ? copy.optionalEmail : copy.email}<input required={!consumer} dir="ltr" type="email" maxLength={254} /></label>
        {consumer ? <BirthDateFields language={language} /> : <p className="verification-locked">{copy.birth} · {copy.awaitingTrustedResult}</p>}
      </fieldset>
      <RegistrationLocation language={language} />
      {!consumer && <div className="registration-coverage"><strong>{copy.coverage}</strong><p>{copy.coverageHint}</p></div>}
      {business && <fieldset>
        <legend>{copy.business}</legend>
        <label>{copy.businessName}<input required maxLength={150} /></label>
        <label>{copy.businessType}<input required maxLength={100} /></label>
        <label>{copy.premises}<input required maxLength={300} /></label>
      </fieldset>}
      {courier && <fieldset>
        <legend>{copy.delivery}</legend>
        <label>{copy.vehicle}<select required value={vehicleType} onChange={event => setVehicleType(event.target.value)}>
          <option value="">{copy.select}</option>
          <option value="rider">{copy.rider}</option>
          <option value="car">{copy.car}</option>
          <option value="truck">{copy.truck}</option>
          <option value="bicycle">{copy.bicycle}</option>
        </select></label>
        {vehicleType && ["car", "truck"].includes(vehicleType) && <p role="status">{copy.manualOwnershipReview}</p>}
        {vehicleType && vehicleType !== "bicycle" && <RegistrationPlateArtwork
          kind={vehicleType === "rider" ? "compact" : "wide"}
          image={`/images/vehicle-plates/${vehicleType === "rider" ? "motorcycle-light-blue" : vehicleType === "car" ? "car-blue" : "transport-red"}.png`}
          alt={copy.plate} lettersLabel={copy.plateLetters} digitsLabel={copy.plateDigits}
          {...mapTrustedVehiclePlate()} />}
      </fieldset>}
      {!consumer && <fieldset>
        <legend>{copy.documents}</legend>
        <ul>
          <li>{copy.id}</li>
          {business && <li>{copy.facade}</li>}
        </ul>
        <RegistrationCamera language={language} items={cameraItems} />
        <VerificationDossier role={role} language={language} vehicleType={vehicleType} />
        <p>{copy.upload}</p>
      </fieldset>}
      <fieldset>
        <legend>{copy.policies}</legend>
        <ul>{applicablePolicies.map(policy => <li key={policy}>{policy}</li>)}</ul>
        <p>{copy.policyHint}</p>
      </fieldset>
      <p>{consumer ? copy.consumerReview : copy.review}</p>
      <button type="submit">{copy.validate}</button>
      <p role="status">{checked ? copy.valid : ""}</p>
    </form>
  );
}
