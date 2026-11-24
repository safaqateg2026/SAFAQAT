import type { Language } from "./landingMessages";
import { governorates, insideRing, type Point } from "./registrationGeography";

export type ResidentialLocality = {
  id: string;
  ar: string;
  en: string;
  kind: string;
  district?: string;
  point?: Point;
  context?: Record<Language, string>;
  aliases?: string[];
  mappedArea?: true;
  source?: string;
  reference?: string;
};

export type IndexedLocality = Omit<ResidentialLocality, "context"> & { label: string; context: string; search: string; areaIds: string[] };
export type LocalityAreas = Record<string, Point[]>;

export function normalizeLocalityName(value: string) {
  return value.normalize("NFKD").toLowerCase()
    .replace(/\p{M}|ـ/gu, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىةؤئ]/g, letter => ({ "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي" })[letter]!)
    .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) % 16))
    .replace(/(\p{L})([0-9])/gu, "$1 $2").replace(/([0-9])(\p{L})/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function metersBetween(first: Point, second: Point) {
  const latitude = (first[1] + second[1]) * Math.PI / 360;
  return 111195 * Math.hypot(first[1] - second[1], (first[0] - second[0]) * Math.cos(latitude));
}

export async function loadLocalities(code: string, signal: AbortSignal): Promise<ResidentialLocality[]> {
  if (!governorates.some(governorate => governorate.code === code)) throw new TypeError("unknown governorate");
  const response = await fetch(`/registration-geography/localities-v2/${code}.json`, { signal });
  if (!response.ok) throw new Error("locality catalog unavailable");
  return await response.json() as ResidentialLocality[];
}

// Keep namesakes in separate districts or at separate positions. Co-located
// entries with an identical sourced name contribute aliases to one choice.
export function indexLocalities(records: ResidentialLocality[], code: string, language: Language): IndexedLocality[] {
  type Entry = ResidentialLocality & { areaIds: string[] };
  const byName = new Map<string, Entry[]>();
  const merged: Entry[] = [];
  for (const record of records) {
    const names = [...new Set([record.ar, record.en, ...(record.aliases ?? [])].map(normalizeLocalityName).filter(Boolean))];
    const matching = names.map(name => byName.get(name)?.find(other => other.district === record.district
      && other.point && record.point && metersBetween(other.point, record.point) < 300)).find(Boolean);
    const item = matching ?? { ...record, areaIds: [], aliases: [...(record.aliases ?? [])] };
    if (record.mappedArea) item.areaIds.push(record.id);
    if (matching) {
      item.ar ||= record.ar;
      item.en ||= record.en;
      item.aliases = [...new Set([...(item.aliases ?? []), record.ar, record.en, ...(record.aliases ?? [])].filter(Boolean))];
    } else {
      merged.push(item);
    }
    for (const name of names) {
      const matches = byName.get(name) ?? [];
      if (!matches.includes(item)) matches.push(item);
      byName.set(name, matches);
    }
  }
  const districts = new Map(governorates.find(row => row.code === code)?.districts.map(row => [row.code, row[language]]));
  const labels = new Map<string, number>();
  for (const row of merged) {
    const key = row.district + " " + normalizeLocalityName(row[language] || row.ar || row.en);
    labels.set(key, (labels.get(key) ?? 0) + 1);
  }
  const collator = new Intl.Collator(language, { numeric: true });
  return merged.map(row => {
    const label = row[language] || row.ar || row.en;
    const district = (row.context?.[language] ?? districts.get(row.district ?? "") ?? "").replace(/^(قسم|مركز)\s+/u, "");
    const namesake = (labels.get(row.district + " " + normalizeLocalityName(label)) ?? 0) > 1;
    const context = namesake ? `${district} · ${row.id}` : district;
    return { ...row, label, context, search: normalizeLocalityName([row.ar, row.en, ...(row.aliases ?? []), district].join(" ")) };
  }).sort((first, second) => collator.compare(first.label, second.label) || collator.compare(first.context, second.context));
}

export function searchLocalities(records: IndexedLocality[], query: string) {
  const words = normalizeLocalityName(query).split(" ").filter(Boolean);
  return words.length ? records.filter(record => words.every(word => record.search.includes(word))) : records;
}

function includesAccuratePoint(point: Point, ring: Point[], accuracy: number) {
  if (!insideRing(point, ring)) return false;
  const longitudeScale = 111195 * Math.cos(point[1] * Math.PI / 180);
  for (let index = 1; index < ring.length; index++) {
    const [ax, ay] = [(ring[index - 1][0] - point[0]) * longitudeScale, (ring[index - 1][1] - point[1]) * 111195];
    const [bx, by] = [(ring[index][0] - point[0]) * longitudeScale, (ring[index][1] - point[1]) * 111195];
    const [dx, dy] = [bx - ax, by - ay];
    const length = dx * dx + dy * dy;
    const progress = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    if (Math.hypot(ax + dx * progress, ay + dy * progress) <= Math.max(accuracy, 1)) return false;
  }
  return true;
}

export async function loadLocalityAreas(district: string, signal: AbortSignal): Promise<LocalityAreas> {
  if (!/^EG[0-9]{4}$/.test(district)) throw new TypeError("invalid district");
  const response = await fetch(`/registration-geography/localities-v1/osm-areas/${district}.json`, { signal });
  if (!response.ok) throw new Error("locality outlines unavailable");
  return response.json() as Promise<LocalityAreas>;
}

export function suggestLocality(point: Point, accuracy: number, records: IndexedLocality[], district: string, areas: LocalityAreas) {
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 75) return undefined;
  const eligible = records.filter(record => record.district === district);
  const areaMatches = eligible.flatMap(record => record.areaIds.map(id => areas[id])
    .filter(ring => ring && insideRing(point, ring))
    .map(ring => ({ record, ring })));
  if (areaMatches.length) {
    const [area] = areaMatches;
    return areaMatches.every(match => match.record.id === area.record.id)
      && areaMatches.some(match => includesAccuratePoint(point, match.ring, accuracy)) ? area.record : undefined;
  }
  const nearby = eligible.filter(record => !record.areaIds.length && record.id.startsWith("n:")
    && record.point && metersBetween(point, record.point) + accuracy <= 90);
  return nearby.length === 1 ? nearby[0] : undefined;
}
