import catalog from "./egyptRegistrationCatalog.json";

export type Point = [longitude: number, latitude: number];
export type Boundary = { code: string; parent: string; bounds: [number, number, number, number]; polygons: Point[][][] };
export const governorates = catalog;
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
