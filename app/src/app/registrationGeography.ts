import catalog from "./egyptRegistrationCatalog.json";
import whitelist from "./safaqatGeographicWhitelist.json";

export type Point = [longitude: number, latitude: number];
export type Boundary = { code: string; parent: string; bounds: [number, number, number, number]; polygons: Point[][][] };
const governorateCodes: Record<string, string> = {
  "القاهرة":"EG01", "الجيزة":"EG21", "الإسكندرية":"EG02", "القليوبية":"EG14", "البحيرة":"EG18", "مطروح":"EG33", "كفر الشيخ":"EG15", "الغربية":"EG16", "المنوفية":"EG17", "الدقهلية":"EG12", "دمياط":"EG11", "الشرقية":"EG13", "بورسعيد":"EG03", "الإسماعيلية":"EG19", "السويس":"EG04", "شمال سيناء":"EG34", "جنوب سيناء":"EG35", "الفيوم":"EG23", "بني سويف":"EG22", "المنيا":"EG24", "أسيوط":"EG25", "سوهاج":"EG26", "قنا":"EG27", "الأقصر":"EG29", "أسوان":"EG28", "البحر الأحمر":"EG31", "الوادي الجديد":"EG32"
};
export const governorates = Object.entries(whitelist).map(([ar], index) => {
  const source = catalog.find(item => item.code === governorateCodes[ar]);
  if (!source) throw new Error(`Missing governorate code for ${ar}`);
  return { ...source, order: index, ar };
});
export const initialCenter: Point = [30.8, 26.8];

export function insideRing([x, y]: Point, ring: Point[]) {
  let inside = false;
  for (let index = 0, last = ring.length - 1; index < ring.length; last = index++) {
    const [ax, ay] = ring[index];
    const [bx, by] = ring[last];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function locateDistrict(point: Point, boundaries: Boundary[]) {
  const matches = boundaries.filter(({ bounds: [west, south, east, north], polygons }) =>
    point[0] >= west && point[0] <= east && point[1] >= south && point[1] <= north
    && polygons.some(([shell, ...holes]) => insideRing(point, shell) && !holes.some(hole => insideRing(point, hole))));
  return matches.length === 1 ? matches[0] : undefined;
}

export type MapIndex = { outline: Boundary[]; districts: Pick<Boundary, "code" | "parent" | "bounds">[] };

export async function loadRegistrationMap(signal: AbortSignal) {
  const response = await fetch("/registration-geography/map-v1/index.json", { signal });
  if (!response.ok) throw new Error("map data unavailable");
  return response.json() as Promise<MapIndex>;
}

export async function resolveRegistrationDistrict(point: Point, index: MapIndex, signal: AbortSignal) {
  const [x, y] = point;
  const candidates = new Set(index.districts
    .filter(({ bounds: [west, south, east, north] }) => west <= x && x <= east && south <= y && y <= north)
    .map(district => district.parent));
  let found: { area: Boundary; boundaries: Boundary[] } | undefined;
  for (const code of candidates) {
    const response = await fetch(`/registration-geography/map-v1/${code}.json`, { signal });
    if (!response.ok) throw new Error("district boundaries unavailable");
    const boundaries = await response.json() as Boundary[];
    const area = locateDistrict(point, boundaries);
    if (!area) continue;
    if (found) return undefined;
    found = { area, boundaries };
  }
  return found;
}
