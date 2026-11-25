import { useEffect, useRef, useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import { assessRegistrationImage } from "./registrationImageQuality";

type CameraItem = { key: string; label: string; selfie?: boolean; optional?: boolean; videoOnly?: boolean };
type CaptureError = NonNullable<ReturnType<typeof assessRegistrationImage>> | "cameraUnavailable";

export default function RegistrationCamera({ language, items }: { language: Language; items: CameraItem[] }) {
  const copy = registrationMessages[language];
  const [consent, setConsent] = useState(false);
  const [item, setItem] = useState<CameraItem>();
  const [preview, setPreview] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CaptureError>();
  const [accepted, setAccepted] = useState<string>();
  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(() => new Set());
  const [faceStep, setFaceStep] = useState(0);
  const [videoRatio, setVideoRatio] = useState("4 / 3");
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const instruction = item?.selfie
    ? [copy.faceFront, copy.faceRight, copy.faceLeft][faceStep]
    : item?.key === "vehiclePhoto" ? copy.vehiclePhotoFrame
      : item?.key === "premisesExterior" ? copy.premisesExteriorFrame
        : item?.key === "premisesInterior" ? copy.premisesInteriorFrame
          : item?.key.startsWith("id") ? item.key.endsWith("Back") ? copy.idBackFrame : copy.idFrontFrame
            : item?.key.startsWith("drivingLicense") ? item.key.endsWith("Back") ? copy.drivingLicenseBackFrame : copy.drivingLicenseFrame
              : item?.key.startsWith("vehicleLicense") ? item.key.endsWith("Back") ? copy.vehicleLicenseBackFrame : copy.vehicleLicenseFrame : copy.photoFrame;

  useEffect(() => {
    if (!item || preview) return;
    let disposed = false;
    let stream: MediaStream | undefined;
    const element = video.current;
    function stop() {
      disposed = true;
      stream?.getTracks().forEach(track => track.stop());
      if (element) element.srcObject = null;
    }
    function suspend() {
      if (document.hidden) { stop(); setReady(false); setError("cameraUnavailable"); }
    }
    document.addEventListener("visibilitychange", suspend);
    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { exact: item?.selfie ? "user" : "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
        });
        if (disposed || !element) { media.getTracks().forEach(track => track.stop()); return; }
        stream = media;
        element.srcObject = media;
        await element.play();
      } catch {
        if (!disposed) { stop(); setError("cameraUnavailable"); }
      }
    }
    void start();
    return () => { document.removeEventListener("visibilitychange", suspend); stop(); };
  }, [item, preview]);

  function clear() {
    const frame = canvas.current;
    if (frame) { frame.width = 1; frame.height = 1; }
    setPreview(false);
    setReady(false);
    setError(undefined);
  }

  function takePhoto() {
    const source = video.current;
    const frame = canvas.current;
    if (!source || !frame || source.readyState < 2) return;
    const { videoWidth: width, videoHeight: height } = source;
    if (!width || !height) return;
    const sample = document.createElement("canvas");
    sample.width = 192;
    sample.height = Math.max(3, Math.round(height * sample.width / width));
    const context = sample.getContext("2d", { willReadFrequently: true });
    const target = frame.getContext("2d");
    if (!context || !target) { setError("cameraUnavailable"); return; }
    context.drawImage(source, 0, 0, sample.width, sample.height);
    const issue = assessRegistrationImage(width, height, context.getImageData(0, 0, sample.width, sample.height).data, sample.width);
    sample.width = 1;
    if (issue) { setError(issue); return; }
    const scale = Math.min(1, 1280 / Math.max(width, height));
    frame.width = Math.floor(width * scale);
    frame.height = Math.floor(height * scale);
    target.drawImage(source, 0, 0, frame.width, frame.height);
    setError(undefined);
    setPreview(true);
  }

  return (
    <div className="registration-camera">
      <label className="registration-consent">
        <input type="checkbox" checked={consent} onChange={event => {
          clear(); setItem(undefined); setConsent(event.target.checked);
          if (!event.target.checked) setAcceptedKeys(new Set());
        }} />
        {copy.sampleCamera}
      </label>
      <div className="registration-actions">
        {items.map(option => {
          const complete = acceptedKeys.has(option.key);
          return <button key={option.key} className={`registration-capture-option${option.videoOnly ? " registration-capture-video" : ""}`} type="button" disabled={!consent}
            aria-label={`${option.label}${complete ? ` · ${copy.captureQualityPassed}` : ""}`}
            onClick={() => {
              clear(); setAccepted(undefined); setFaceStep(0); setVideoRatio("4 / 3"); setItem({ ...option });
              setAcceptedKeys(previous => { const next = new Set(previous); next.delete(option.key); return next; });
            }}>
            <span>{option.label}</span>
            {complete && <span className="capture-success-indicator" role="img" aria-label={copy.captureQualityPassed}>✓</span>}
          </button>;
        })}
      </div>
      {item && <div className="registration-camera-stage">
        <strong>{item.label}</strong>
        {item.selfie && <p role="note">{copy.faceCaptureLabel} {instruction} {copy.faceManualStep}</p>}
        {!item.selfie && <p role="note">{copy.documentCaptureLabel} {instruction}{item.optional ? ` ${copy.optionalPhoto}` : ""}</p>}
        {!preview && <div className="registration-viewfinder" style={{ aspectRatio: videoRatio }}>
          <video ref={video} autoPlay muted playsInline onLoadedMetadata={event => {
            const { videoWidth, videoHeight } = event.currentTarget;
            if (videoWidth && videoHeight) setVideoRatio(`${videoWidth} / ${videoHeight}`);
          }} onLoadedData={() => setReady(true)} />
          <div aria-hidden="true" className={item.selfie ? "registration-frame registration-frame-selfie" : "registration-frame"} />
        </div>}
        {!item.selfie && <canvas ref={canvas} hidden={!preview} aria-label={copy.photoPreview} />}
        <p role="status">{error ? copy[error] : preview ? copy.photoReview : instruction}</p>
        <div className="registration-actions">
          {item.selfie && faceStep < 2 && <button type="button" disabled={!ready} onClick={() => setFaceStep(value => value + 1)}>{copy.nextFaceStep}</button>}
          {item.selfie && faceStep === 2 && <button type="button" onClick={() => { setItem(undefined); setAccepted(copy.faceCaptureLabel); }}>{copy.finishFacePreview}</button>}
          {!item.selfie && !item.videoOnly && !preview && <button type="button" disabled={!ready} onClick={takePhoto}>{copy.capture}</button>}
          {item.videoOnly && <p role="note">{copy.faceVideoCaptureUnavailable}</p>}
          {preview && <>
            <button type="button" onClick={clear}>{copy.retake}</button>
            <button type="button" onClick={() => {
              const completedItem = item;
              clear(); setAccepted(completedItem.label); setItem(undefined);
              setAcceptedKeys(previous => new Set(previous).add(completedItem.key));
            }}>{copy.confirmSample}</button>
          </>}
          <button type="button" onClick={() => { clear(); setItem(undefined); }}>{copy.cancel}</button>
        </div>
      </div>}
      {accepted && <p role="status">{accepted} · {copy.sampleDiscarded}</p>}
    </div>
  );
}
