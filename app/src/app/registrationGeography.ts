import catalog from "./egyptRegistrationCatalog.json";

export type Point = [longitude: number, latitude: number];
export type Boundary = { code: string; parent: string; bounds: [number, number, number, number]; polygons: Point[][][] };
export const governorates = catalog;
export const initialCenter: Point = [30.8, 26.8];

function insideRing([x, y]: Point, ring: Point[]) {
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
