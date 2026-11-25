import type { Language } from "./landingMessages";
import { governorates } from "./registrationGeography";
import approvedRecords from "./safaqatApprovedAreaRecords.json";

export type CuratedArea = { id: string; ar: string; en: string; aliases: string[] };
export type IndexedArea = CuratedArea & { label: string; search: string };
export type InternalAreaMap = {
  districtToArea: Record<string, string>;
  unmappedDistricts: string[];
  exactPoints: { area: string; point: [number, number] }[];
  aliases?: Record<string, string[]>;
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
  signal.throwIfAborted();

  if (!governorates.some(governorate => governorate.code === code)) {
    throw new TypeError("unknown governorate");
  }

  const records = (approvedRecords as Record<string, CuratedArea[]>)[code];

  if (!records) throw new Error("area catalog unavailable");

  return records;
}

export async function loadAreaMap(code: string, signal: AbortSignal): Promise<InternalAreaMap> {
  if (!governorates.some(governorate => governorate.code === code)) throw new TypeError("unknown governorate");
  const response = await fetch(`/registration-geography/area-map-v3/${code}.json`, { signal });
  if (!response.ok) throw new Error("area map unavailable");
  return await response.json() as InternalAreaMap;
}

export function indexAreas(records: CuratedArea[], language: Language): IndexedArea[] {
  return records.map(record => ({ ...record, label: language === "en" && record.en ? record.en : record.ar, search: normalizeLocalityName(`${record.ar} ${record.en}`) }));
}

export function searchAreas<T extends { search: string }>(records: T[], query: string) {
  const words = normalizeLocalityName(query).split(" ").filter(Boolean);
  return words.length ? records.filter(record => words.every(word => record.search.includes(word))) : records;
}

export function suggestArea(point: [number, number], accuracy: number, map: InternalAreaMap | undefined, records: CuratedArea[]) {
  if (!map || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 75) return undefined;
  const approved = new Map<string, string[]>();

  for (const record of records) {
    const key = normalizeLocalityName(record.ar);
    approved.set(key, [...(approved.get(key) ?? []), record.id]);
  }

  const nearest = new Map<string, number>();

  for (const item of map.exactPoints) {
    const distance = metersBetween(point, item.point);
    nearest.set(item.area, Math.min(nearest.get(item.area) ?? Infinity, distance));
  }

  const ranked = [...nearest.entries()].sort((a, b) => a[1] - b[1]);
  const first = ranked[0];
  const second = ranked[1];

  if (!first || first[1] + accuracy > 90) return undefined;
  if (second && second[1] - first[1] <= accuracy * 2) return undefined;

  const key = normalizeLocalityName(first[0].replace(/^area-/, ""));
  const matches = approved.get(key);

  return matches?.length === 1 ? matches[0] : undefined;
}
