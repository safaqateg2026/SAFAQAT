import { useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import { governorates, initialCenter, loadRegistrationMap, resolveRegistrationDistrict, type Boundary, type MapIndex, type Point } from "./registrationGeography";
import RegistrationLocalityPicker from "./RegistrationLocalityPicker";
import { normalizeLocalityName, indexAreas, loadAreas, loadAreaMap, suggestArea, type CuratedArea, type InternalAreaMap } from "./registrationLocalities";

const size = [640, 420] as const;

export default function RegistrationLocation({ language }: { language: Language }) {
  const copy = registrationMessages[language];
  const [governorate, setGovernorate] = useState("");
  const [locality, setLocality] = useState("");
  const [address, setAddress] = useState("");
  const [open, setOpen] = useState(false);
  const [map, setMap] = useState<MapIndex>();
  const [resolution, setResolution] = useState<{ point: Point; result?: { area: Boundary; boundaries: Boundary[] } }>();
  const [catalog, setCatalog] = useState<{ code: string; items: CuratedArea[]; failed?: true }>();
  const [areaMaps, setAreaMaps] = useState<Record<string, InternalAreaMap>>({});
  const [accuracy, setAccuracy] = useState(Infinity);
  const [center, setCenter] = useState<Point>(initialCenter);
  const [pin, setPin] = useState<Point>();
  const [confirmed, setConfirmed] = useState<{ point: Point; district: string }>();
  const [scale, setScale] = useState(27);
  const [error, setError] = useState<"mapUnavailable" | "gpsUnavailable" | null>(null);
  const [locating, setLocating] = useState(false);
  const [priorityGovernorate, setPriorityGovernorate] = useState("");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const requestId = useRef({ id: 0 });
  const resolved = pin && resolution?.point === pin ? resolution.result : undefined;
  const match = resolved?.area;
  const activeGovernorate = (open && match?.parent) || governorate;
  const activeCatalog = catalog?.code === activeGovernorate ? catalog : undefined;
  const records = useMemo(() => activeCatalog ? indexAreas(activeCatalog.items, language) : [], [activeCatalog, language]);
  const gpsMap = activeGovernorate ? areaMaps[activeGovernorate] : undefined;
  const suggestedId = open && pin && match ? suggestArea(pin, accuracy, gpsMap, activeCatalog?.items ?? []) : undefined;
  const suggestion = suggestedId ? records.find(record => record.id === suggestedId) : undefined;
  const boundaries = resolved?.boundaries ?? map?.outline;
  const pinPending = !!(open && pin && map && (resolution?.point !== pin || (!!match && !gpsMap)));

  useEffect(() => {
    const controller = new AbortController();

    async function prioritizeCurrentGovernorate() {
      if (!navigator.geolocation || !navigator.permissions) return;

      try {
        const permission = await navigator.permissions.query({ name: "geolocation" });
        if (permission.state !== "granted" || controller.signal.aborted) return;

        navigator.geolocation.getCurrentPosition(async ({ coords }) => {
          if (controller.signal.aborted || !Number.isFinite(coords.accuracy) || coords.accuracy > 1000) return;

          try {
            const point: Point = [coords.longitude, coords.latitude];
            const index = await loadRegistrationMap(controller.signal);
            const result = await resolveRegistrationDistrict(point, index, controller.signal);

            if (!controller.signal.aborted && result) {
              setPriorityGovernorate(result.area.parent);
            }
          } catch {
            // Preserve the approved order when location cannot be resolved.
          }
        }, () => undefined, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000
        });
      } catch {
        // Do not request permission automatically.
      }
    }

    void prioritizeCurrentGovernorate();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open || map) return;
    const controller = new AbortController();
    loadRegistrationMap(controller.signal).then(setMap)
      .catch(() => { if (!controller.signal.aborted) setError("mapUnavailable"); });
    return () => controller.abort();
  }, [open, map]);

  useEffect(() => {
    const pendingPosition = requestId.current;
    return () => { pendingPosition.id++; };
  }, []);

  useEffect(() => {
    if (!pin || !map || !open) return;
    const controller = new AbortController();
    resolveRegistrationDistrict(pin, map, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setResolution({ point: pin, result });
        if (result && Number.isFinite(accuracy) &&
            accuracy >= 0 && accuracy <= 1000) {
          setPriorityGovernorate(result.area.parent);
        }
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setResolution({ point: pin });
        setError("mapUnavailable");
      }
    });
    return () => controller.abort();
  }, [map, open, pin, accuracy]);

  useEffect(() => {
    if (!activeGovernorate) return;
    const controller = new AbortController();
    loadAreas(activeGovernorate, controller.signal).then(items => {
      if (!controller.signal.aborted) setCatalog({ code: activeGovernorate, items });
    }).catch(() => {
      if (!controller.signal.aborted) setCatalog({ code: activeGovernorate, items: [], failed: true });
    });
    return () => controller.abort();
  }, [activeGovernorate]);

  useEffect(() => {
    if (!activeGovernorate || areaMaps[activeGovernorate]) return;
    const controller = new AbortController();
    loadAreaMap(activeGovernorate, controller.signal).then(value => {
      if (!controller.signal.aborted) setAreaMaps(previous => ({ ...previous, [activeGovernorate]: value }));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [activeGovernorate, areaMaps]);

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
      const x = size[0] / 2 + (pin[0] - center[0]) * scale;
      const y = size[1] / 2 - (pin[1] - center[1]) * scale;
      const accuracyPixels = Number.isFinite(accuracy) ? accuracy / 111195 * scale : 0;
      if (accuracyPixels > 0) {
        context.beginPath(); context.arc(x, y, Math.max(5, accuracyPixels), 0, Math.PI * 2);
        context.fillStyle = "#ffdf6240"; context.fill(); context.strokeStyle = "#ffdf62aa"; context.stroke();
      }
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fillStyle = "#ffdf62";
      context.fill();
    }
  }, [accuracy, boundaries, center, match, open, pin, scale]);

  function detect() {
    setOpen(true);
    setPin(undefined);
    setAccuracy(Infinity);
    setError(null);
    if (!navigator.geolocation) { setError("gpsUnavailable"); return; }
    setLocating(true);
    const id = ++requestId.current.id;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (id !== requestId.current.id) return;
      const point: Point = [coords.longitude, coords.latitude];
      setPin(point);
      setAccuracy(Number.isFinite(coords.accuracy) ? coords.accuracy : Infinity);
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
    setAccuracy(Infinity);
    setError(null);
    setPin(point);
  }

  const mapError = error && copy[error];
  return (
    <fieldset>
      <legend>{copy.location}</legend>
      <button type="button" onClick={detect}>{copy.gps}</button>
      {open && <div className="registration-map">
        <canvas ref={canvas} width={size[0]} height={size[1]} tabIndex={0} aria-label={copy.mapGuide}
          onKeyDown={event => {
            const change: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
            const delta = change[event.key];
            if (!delta || !map) return;
            event.preventDefault();
            const previous = pin ?? center;
            const next: Point = [previous[0] + 12 * delta[0] / scale, previous[1] + 12 * delta[1] / scale];
            correct(next);
            setCenter(next);
          }}
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); }}
          onPointerUp={event => {
            const start = pointers.current.get(event.pointerId);
            pointers.current.delete(event.pointerId);
            if (!start || !map) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const dx = event.clientX - start.x, dy = event.clientY - start.y;
            if (Math.hypot(dx, dy) > 8) {
              const next: Point = [(pin ?? center)[0] - dx / scale, (pin ?? center)[1] + dy / scale];
              correct(next); setCenter(next); return;
            }
            correct([center[0] + ((event.clientX - rect.left) / rect.width - .5) * size[0] / scale,
              center[1] - ((event.clientY - rect.top) / rect.height - .5) * size[1] / scale]);
          }}
          onWheel={event => setScale(value => Math.min(12000, Math.max(20, value * (event.deltaY < 0 ? 1.25 : .8))))} />
        <p role="status">{mapError || (locating ? copy.locating : !boundaries ? copy.loadingMap :
          pinPending ? copy.loadingMap : pin && !match ? copy.locationUnmatched :
          suggestion ? copy.gpsSuggestedLocality.replace("{name}", suggestion.label) : match ? copy.gpsReviewLocality : copy.mapGuide)}</p>
        <div className="registration-actions">
          <button type="button" aria-label={copy.zoomIn} onClick={() => { setCenter(pin ?? center); setScale(Math.min(scale * 2, 12000)); }}>+</button>
          <button type="button" aria-label={copy.zoomOut} onClick={() => setScale(Math.max(scale / 2, 20))}>−</button>
          <button type="button" onClick={detect}>{copy.gps}</button>
          <button type="button" disabled={!match || !activeCatalog || pinPending} onClick={() => {
            if (!pin || !match) return;
            setGovernorate(match.parent);
            setLocality(suggestion?.id ?? "");
            setConfirmed({ point: pin, district: match.code });
            closeMap();
          }}>{copy.confirmLocation}</button>
          <button type="button" onClick={closeMap}>{copy.cancel}</button>
        </div>
        <small>{copy.mapCredit}</small>
      </div>}
      <RegistrationLocalityPicker
        language={language}
        kind="governorate"
        enabled={true}
        records={[...governorates]
          .sort((a, b) =>
            Number(b.code === priorityGovernorate) -
            Number(a.code === priorityGovernorate) ||
            a.order - b.order)
          .map(item => ({
            id: item.code,
            label: item[language],
            search: normalizeLocalityName(`${item.ar} ${item.en}`)
          }))}
        value={activeGovernorate}
        loading={false}
        failed={false}
        onSelect={id => {
          closeMap();
          setGovernorate(id);
          setLocality("");
          setConfirmed(undefined);
        }}
      />
      <RegistrationLocalityPicker language={language} key={activeGovernorate}
        enabled={!!activeGovernorate} records={records} value={suggestion?.id ?? (activeGovernorate === governorate ? locality : "")}
        loading={!!activeGovernorate && !activeCatalog} failed={activeCatalog?.failed === true}
        onSelect={id => {
          if (open && match) {
            setGovernorate(match.parent);
            setConfirmed(undefined);
            closeMap();
          }
          setLocality(id);
          setConfirmed(undefined);
        }} />
      <label>{copy.address}<input
        name="address"
        required
        maxLength={300}
        value={address}
        onChange={event => {
          setAddress(event.target.value);
          setConfirmed(undefined);
        }}
      /></label>
      <input type="hidden" name="governorateCode" value={governorate} />
      <input type="hidden" name="districtCode" value={locality} />
      <input type="hidden" name="latitude"
        value={!open && confirmed && locality ? confirmed.point[1] : ""} />
      <input type="hidden" name="longitude"
        value={!open && confirmed && locality ? confirmed.point[0] : ""} />
      {confirmed && !open && <p role="status">{copy.locationConfirmed}</p>}
    </fieldset>
  );
}
