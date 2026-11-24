import { useEffect, useRef, useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import { governorates, initialCenter, locateDistrict, type Boundary, type Point } from "./registrationGeography";

const size = [640, 420] as const;

export default function RegistrationLocation({ language }: { language: Language }) {
  const copy = registrationMessages[language];
  const [governorate, setGovernorate] = useState("");
  const [district, setDistrict] = useState("");
  const [open, setOpen] = useState(false);
  const [boundaries, setBoundaries] = useState<Boundary[]>();
  const [center, setCenter] = useState<Point>(initialCenter);
  const [pin, setPin] = useState<Point>();
  const [confirmed, setConfirmed] = useState<Point>();
  const [scale, setScale] = useState(27);
  const [error, setError] = useState<"mapUnavailable" | "gpsUnavailable" | null>(null);
  const [locating, setLocating] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const requestId = useRef({ id: 0 });
  const selectedGovernorate = governorates.find(item => item.code === governorate);
  const match = pin && boundaries && locateDistrict(pin, boundaries);

  useEffect(() => {
    if (!open) return;
    const pendingPosition = requestId.current;
    const controller = new AbortController();
    fetch("/registration-geography/egy-adm2-v01.json", { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("boundary data unavailable");
        return response.json() as Promise<Boundary[]>;
      })
      .then(setBoundaries)
      .catch(() => { if (!controller.signal.aborted) setError("mapUnavailable"); });
    return () => { controller.abort(); pendingPosition.id++; };
  }, [open]);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !open) return;
    context.fillStyle = "#241037";
    context.fillRect(0, 0, ...size);
    context.lineWidth = 0.9;
    context.strokeStyle = "#ca9d58";
    for (const boundary of boundaries ?? []) {
      const [west, south, east, north] = boundary.bounds;
      if ((east - center[0]) * scale < -size[0] / 2 || (west - center[0]) * scale > size[0] / 2
        || (north - center[1]) * scale < -size[1] / 2 || (south - center[1]) * scale > size[1] / 2) continue;
      context.beginPath();
      for (const polygon of boundary.polygons) {
        for (const ring of polygon) {
          ring.forEach(([x, y], index) => {
            const pixelX = size[0] / 2 + (x - center[0]) * scale;
            const pixelY = size[1] / 2 - (y - center[1]) * scale;
            if (index === 0) context.moveTo(pixelX, pixelY);
            else context.lineTo(pixelX, pixelY);
          });
          context.closePath();
        }
      }
      context.fillStyle = match?.code === boundary.code ? "#71542e" : "#472353";
      context.fill("evenodd");
      context.stroke();
    }
    if (pin) {
      context.beginPath();
      context.arc(size[0] / 2 + (pin[0] - center[0]) * scale, size[1] / 2 - (pin[1] - center[1]) * scale, 6, 0, Math.PI * 2);
      context.fillStyle = "#ffdf62";
      context.fill();
    }
  }, [boundaries, center, match, open, pin, scale]);

  function detect() {
    setOpen(true);
    setPin(undefined);
    setError(null);
    if (!navigator.geolocation) { setError("gpsUnavailable"); return; }
    setLocating(true);
    const id = ++requestId.current.id;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (id !== requestId.current.id) return;
      const point: Point = [coords.longitude, coords.latitude];
      setPin(point);
      setCenter(point);
      setScale(750);
      setLocating(false);
    }, () => {
      if (id !== requestId.current.id) return;
      setLocating(false);
      setError("gpsUnavailable");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }

  function closeMap() {
    requestId.current.id++;
    setLocating(false);
    setOpen(false);
  }

  function correct(point: Point) {
    requestId.current.id++;
    setLocating(false);
    setPin(point);
  }

  const mapError = error && copy[error];
  return (
    <fieldset>
      <legend>{copy.location}</legend>
      <label>{copy.governorate}
        <select required value={open && match ? match.parent : governorate} onChange={event => {
          closeMap(); setGovernorate(event.target.value); setDistrict(""); setConfirmed(undefined);
        }}>
          <option value="">{copy.select}</option>
          {governorates.map(item => <option key={item.code} value={item.code}>{item[language]}</option>)}
        </select>
      </label>
      <label>{copy.district}
        <select required disabled={!selectedGovernorate && !match} value={open && match ? match.code : district}
          onChange={event => {
            const target = event.target.value;
            if (open && match) setGovernorate(match.parent);
            closeMap(); setDistrict(target); setConfirmed(undefined);
          }}>
          <option value="">{copy.select}</option>
          {(open && match ? governorates.find(item => item.code === match.parent) : selectedGovernorate)?.districts.map(
            item => <option key={item.code} value={item.code}>{item[language]}</option>)}
        </select>
      </label>
      <label>{copy.address}<input required maxLength={300} /></label>
      <button type="button" onClick={detect}>{copy.gps}</button>
      {confirmed && !open && <p role="status">{copy.locationConfirmed}</p>}
      {open && <div className="registration-map">
        <canvas ref={canvas} width={size[0]} height={size[1]} tabIndex={0} aria-label={copy.mapGuide}
          onKeyDown={event => {
            const change: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
            const delta = change[event.key];
            if (!delta || !boundaries) return;
            event.preventDefault();
            const previous = pin ?? center;
            const next: Point = [previous[0] + 12 * delta[0] / scale, previous[1] + 12 * delta[1] / scale];
            correct(next);
            setCenter(next);
          }}
          onClick={event => {
            if (!boundaries) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            correct([center[0] + ((event.clientX - bounds.left) / bounds.width - .5) * size[0] / scale,
              center[1] - ((event.clientY - bounds.top) / bounds.height - .5) * size[1] / scale]);
          }} />
        <p role="status">{mapError || (locating ? copy.locating : !boundaries ? copy.loadingMap :
          pin && !match ? copy.locationUnmatched : copy.mapGuide)}</p>
        <div className="registration-actions">
          <button type="button" aria-label={copy.zoomIn} onClick={() => { setCenter(pin ?? center); setScale(Math.min(scale * 2, 12000)); }}>+</button>
          <button type="button" aria-label={copy.zoomOut} onClick={() => setScale(Math.max(scale / 2, 20))}>−</button>
          <button type="button" onClick={() => { setCenter(initialCenter); setScale(27); }}>{copy.resetMap}</button>
          <button type="button" disabled={!match} onClick={() => {
            if (!pin || !match) return;
            setGovernorate(match.parent); setDistrict(match.code); setConfirmed(pin); closeMap();
          }}>{copy.confirmLocation}</button>
          <button type="button" onClick={closeMap}>{copy.cancel}</button>
        </div>
        <small>{copy.mapCredit}</small>
      </div>}
    </fieldset>
  );
}
