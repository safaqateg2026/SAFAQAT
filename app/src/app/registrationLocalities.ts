import type { Language } from "./landingMessages";
import { governorates } from "./registrationGeography";

export type CuratedArea = { id: string; ar: string; en: string; aliases: string[] };
export type IndexedArea = CuratedArea & { label: string; search: string };
export type InternalAreaMap = {
  districtToArea: Record<string, string>;
  unmappedDistricts: string[];
  exactPoints: { area: string; point: [number, number] }[];
};

export function normalizeLocalityName(value: string) {
  return value.normalize("NFKD").toLowerCase()
    .replace(/\p{M}|ـ/gu, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىةؤئ]/g, letter => ({ "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي" })[letter]!)
    .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) % 16))
    .replace(/(\p{L})([0-9])/gu, "$1 $2").replace(/([0-9])(\p{L})/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function metersBetween(first: [number, number], second: [number, number]) {
  const latitude = (first[1] + second[1]) * Math.PI / 360;
  return 111195 * Math.hypot(first[1] - second[1], (first[0] - second[0]) * Math.cos(latitude));
}

export async function loadAreas(code: string, signal: AbortSignal): Promise<CuratedArea[]> {
  if (!governorates.some(governorate => governorate.code === code)) throw new TypeError("unknown governorate");
  const response = await fetch(`/registration-geography/areas-v3/${code}.json`, { signal });
  if (!response.ok) throw new Error("area catalog unavailable");
  return await response.json() as CuratedArea[];
}

export async function loadAreaMap(code: string, signal: AbortSignal): Promise<InternalAreaMap> {
  if (!governorates.some(governorate => governorate.code === code)) throw new TypeError("unknown governorate");
  const response = await fetch(`/registration-geography/area-map-v3/${code}.json`, { signal });
  if (!response.ok) throw new Error("area map unavailable");
  return await response.json() as InternalAreaMap;
}

export function indexAreas(records: CuratedArea[], language: Language): IndexedArea[] {
  const seen = new Set<string>();
  const normalized = records.flatMap(record => {
    const label = (language === "ar" ? record.ar : record.en) || record.ar || record.en;
    const key = normalizeLocalityName(label);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ ...record, label, search: normalizeLocalityName([record.ar, record.en, ...record.aliases].join(" ")) }];
  });
  return normalized.sort((first, second) => new Intl.Collator(language, { numeric: true }).compare(first.label, second.label));
}

export function searchAreas(records: IndexedArea[], query: string) {
  const words = normalizeLocalityName(query).split(" ").filter(Boolean);
  return words.length ? records.filter(record => words.every(word => record.search.includes(word))) : records;
}

export function suggestArea(point: [number, number], accuracy: number, map: InternalAreaMap | undefined) {
  if (!map || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 75) return undefined;
  const exact = map.exactPoints.map(item => ({ ...item, distance: metersBetween(point, item.point) }))
    .filter(item => item.distance + accuracy <= 90)
    .sort((first, second) => first.distance - second.distance);
  if (exact.length && (exact.length === 1 || exact[1].distance - exact[0].distance > accuracy * 2)) return exact[0].area;
  // A broad administrative polygon can span multiple familiar localities. Only
  // populate the area field when a surveyed locality point gives a confident match.
  if (exact.length) return undefined;
  return undefined;
}
