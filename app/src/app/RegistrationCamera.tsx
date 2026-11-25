"use client";
import { useEffect, useRef, useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import ContextHelp from "./ContextHelp";

type CameraItem = { key: string; label: string; selfie?: boolean; optional?: boolean; videoOnly?: boolean };

/** Visual-only capture preparation; it deliberately never opens or records from a device camera. */
export default function RegistrationCamera({ language, items }: { language: Language; items: CameraItem[] }) {
  const copy = registrationMessages[language];
  const [item, setItem] = useState<CameraItem>();
  const [faceStep, setFaceStep] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!item) return;
    const frame = requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant" : "smooth",
        block: "center",
        inline: "nearest"
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [item]);
  const isFace = Boolean(item?.selfie);
  const instruction = isFace ? [copy.faceFront, copy.faceRight, copy.faceLeft][faceStep]
    : item?.key === "vehiclePhoto" ? copy.vehiclePhotoFrame
      : item?.key === "premisesExterior" ? copy.premisesExteriorFrame
        : item?.key === "premisesInterior" ? copy.premisesInteriorFrame
          : item?.key.startsWith("id") ? item.key.endsWith("Back") ? copy.idBackFrame : copy.idFrontFrame
            : item?.key.startsWith("drivingLicense") ? item.key.endsWith("Back") ? copy.drivingLicenseBackFrame : copy.drivingLicenseFrame
              : item?.key.startsWith("vehicleLicense") ? item.key.endsWith("Back") ? copy.vehicleLicenseBackFrame : copy.vehicleLicenseFrame : copy.photoFrame;
  return <div className="registration-camera" data-capture-interface="preview-only">
    <div className="registration-actions">
      {items.map(option => <div key={option.key}
        className={`registration-capture-wrapper${option.videoOnly || option.key === "vehiclePhoto" ? " registration-capture-full" : ""}`}>
        <button className="registration-capture-option" type="button"
          aria-label={`${option.label} · ${copy.captureUnavailable}`}
          onClick={() => { setItem({ ...option }); setFaceStep(0); }}>
          <span>{option.label}</span>
        </button>
        <ContextHelp label={copy.help} text={option.selfie ? copy.faceCaptureHelp : copy.documentCaptureHelp} />
      </div>)}
    </div>
    {item && <section className="registration-camera-stage" aria-label={item.label}>
      <div className="registration-camera-stage-heading"><strong>{item.label}</strong><button type="button" onClick={() => setItem(undefined)}>{copy.cancel}</button></div>
      <p role="note">{isFace ? copy.faceCaptureLabel : copy.documentCaptureLabel} {instruction}</p>
      <div ref={previewRef} className="registration-viewfinder registration-synthetic-viewfinder" data-subject={isFace ? "face" : "document"}>
        <span className="registration-frame-placeholder" aria-hidden="true" />
        <span className={isFace ? "registration-frame registration-frame-selfie" : "registration-frame"} aria-hidden="true" />
        <strong>{copy.syntheticPreviewOnly}</strong>
      </div>
      <p role="status">{copy.captureUnavailable}</p>
      {isFace && <p role="note">{copy.faceManualStep}</p>}
      <div className="registration-actions">
        {isFace && faceStep < 2 && <button type="button" onClick={() => setFaceStep(value => value + 1)}>{copy.nextFaceStep}</button>}
        {item.optional && <p>{copy.optionalPhoto}</p>}
      </div>
    </section>}
  </div>;
}
