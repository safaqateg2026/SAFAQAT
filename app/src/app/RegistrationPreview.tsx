import { useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import "./RegistrationPreview.css";

export type RegistrationRole = keyof typeof registrationMessages.ar.title;

function latestBirthday() {
  const date = new Date();
  const year = date.getFullYear() - 18;
  const month = date.getMonth();
  const day = Math.min(date.getDate(), new Date(year, month + 1, 0).getDate());
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function RegistrationPreview({ role, language }: { role: RegistrationRole; language: Language }) {
  const copy = registrationMessages[language];
  const [checked, setChecked] = useState(false);
  const business = role === "merchant" || role === "supplier";
  const courier = role === "courier";
  const consumer = role === "consumer";
  const documents: string[] = [copy.id, copy.idFront, copy.idBack, copy.selfie];
  if (business) documents.push(copy.facade);
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
        <label>{copy.birth}<input required type="date" max={latestBirthday()} /></label>
      </fieldset>
      <fieldset>
        <legend>{copy.location}</legend>
        <label>{copy.governorate}<input required maxLength={100} /></label>
        <label>{copy.district}<input required maxLength={100} /></label>
        <label>{copy.address}<input required maxLength={300} /></label>
        <label>{copy.latitude}<input required type="number" step="any" min="-90" max="90" dir="ltr" /></label>
        <label>{copy.longitude}<input required type="number" step="any" min="-180" max="180" dir="ltr" /></label>
        {!consumer && <label>{copy.coverage}<input disabled placeholder={copy.coverageHint} /></label>}
      </fieldset>
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
        <label>{copy.plate}<input maxLength={30} /></label>
      </fieldset>}
      {!consumer && <fieldset>
        <legend>{copy.documents}</legend>
        <ul>{[...documents, ...(courier ? [copy.vehiclePhoto, copy.drivingLicense, copy.vehicleLicense] : [])]
          .map(document => <li key={document}>{document}</li>)}</ul>
        <button type="button" disabled>{copy.upload}</button>
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
