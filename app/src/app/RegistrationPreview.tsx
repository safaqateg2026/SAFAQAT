import { useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import BirthDateFields from "./BirthDateFields";
import RegistrationLocation from "./RegistrationLocation";
import RegistrationCamera from "./RegistrationCamera";
import "./RegistrationPreview.css";

export type RegistrationRole = keyof typeof registrationMessages.ar.title;

export default function RegistrationPreview({ role, language }: { role: RegistrationRole; language: Language }) {
  const copy = registrationMessages[language];
  const [checked, setChecked] = useState(false);
  const business = role === "merchant" || role === "supplier";
  const courier = role === "courier";
  const consumer = role === "consumer";
  const cameraItems = [
    { key: "idFront", label: copy.idFront }, { key: "idBack", label: copy.idBack },
    { key: "selfie", label: copy.selfie, selfie: true },
    ...(courier ? [
      { key: "vehiclePhoto", label: copy.vehiclePhoto },
      { key: "drivingLicense", label: copy.drivingLicense },
      { key: "vehicleLicense", label: copy.vehicleLicense },
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
        <label>{copy.name}<input required maxLength={150} /></label>
        <label>{copy.phone}<input required type="tel" dir="ltr" pattern="\+201[0-9]{9}" maxLength={13} /></label>
        <label>{consumer ? copy.optionalEmail : copy.email}<input required={!consumer} dir="ltr" type="email" maxLength={254} /></label>
        <BirthDateFields language={language} />
      </fieldset>
      <RegistrationLocation language={language} />
      {!consumer && <label>{copy.coverage}<input disabled placeholder={copy.coverageHint} /></label>}
      {business && <fieldset>
        <legend>{copy.business}</legend>
        <label>{copy.businessName}<input required maxLength={150} /></label>
        <label>{copy.businessType}<input required maxLength={100} /></label>
        <label>{copy.premises}<input required maxLength={300} /></label>
      </fieldset>}
      {courier && <fieldset>
        <legend>{copy.delivery}</legend>
        <label>{copy.vehicle}<select required defaultValue="">
          <option value="">{copy.select}</option>
          <option value="rider">{copy.rider}</option>
          <option value="car">{copy.car}</option>
          <option value="truck">{copy.truck}</option>
        </select></label>
        <div className="registration-plate" aria-label={copy.plate}>
          <label>{copy.plateLetters}<input name="plate_letters" dir="rtl" inputMode="text" maxLength={6}
            pattern="[ء-يٱ-ۓ ]{0,6}" autoComplete="off" /></label>
          <label>{copy.plateDigits}<input name="plate_digits" dir="ltr" inputMode="numeric" maxLength={8}
            pattern="[0-9٠-٩۰-۹ ]{0,8}" autoComplete="off" /></label>
        </div>
      </fieldset>}
      {!consumer && <fieldset>
        <legend>{copy.documents}</legend>
        <ul>
          <li>{copy.id}</li>
          {business && <li>{copy.facade}</li>}
        </ul>
        <RegistrationCamera language={language} items={cameraItems} />
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
