function validPoint(point) {
  return Number.isFinite(point?.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point?.longitude) && Math.abs(point.longitude) <= 180;
}

export function distanceMeters(first, second) {
  if (!validPoint(first) || !validPoint(second)) throw new TypeError("invalid geographic coordinates");
  const radians = Math.PI / 180;
  const latitudeDelta = (second.latitude - first.latitude) * radians;
  const longitudeDelta = (second.longitude - first.longitude) * radians;
  const chord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(first.latitude * radians) * Math.cos(second.latitude * radians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, chord)));
}

export function coversLocation(coverage, location) {
  if (!coverage || !location || coverage.governorateCode !== location.governorateCode) return false;
  if (coverage.mode === "governorate") return true;
  if (coverage.mode === "districts") return coverage.districts.includes(location.districtCode);
  return coverage.mode === "radius" && validPoint(location) && validPoint(coverage.center)
    && distanceMeters(coverage.center, location) <= coverage.radiusMeters;
}

// actor comes from the authenticated server context. The location catalog is
// authoritative for administrative labels and validates radius centers.
export async function saveCoverage(database, actor, coverage, catalog) {
  const districtCatalog = catalog.districts.get(coverage.governorateCode);
  if (!districtCatalog || !["radius", "districts", "governorate"].includes(coverage.mode)) {
    throw new TypeError("invalid coverage");
  }
  const districts = coverage.mode === "districts" ? coverage.districts : [];
  if (coverage.mode === "districts" && (!Array.isArray(districts) || !districts.length
    || districts.length > districtCatalog.size || districts.some(code => !districtCatalog.has(code)))) {
    throw new TypeError("invalid coverage districts");
  }
  const center = coverage.mode === "radius" ? coverage.center : null;
  if (coverage.mode === "radius" && (!validPoint(center) || !Number.isSafeInteger(coverage.radiusMeters)
    || coverage.radiusMeters < 1 || !catalog.containsPoint(coverage.governorateCode, center))) {
    throw new TypeError("invalid coverage radius");
  }
  const serviceAccount = `
    SELECT id FROM subscriber WHERE id = ?1 AND state = 'active'
      AND role IN ('supplier', 'retailer', 'courier')
  `;
  const upsert = database.prepare(`
    INSERT INTO subscriber_coverage
      (subscriber_id, governorate_code, mode, center_latitude, center_longitude, radius_meters)
    SELECT id, ?2, ?3, ?4, ?5, ?6 FROM (${serviceAccount}) WHERE true
    ON CONFLICT (subscriber_id) DO UPDATE SET governorate_code = excluded.governorate_code,
      mode = excluded.mode, center_latitude = excluded.center_latitude,
      center_longitude = excluded.center_longitude, radius_meters = excluded.radius_meters
    RETURNING subscriber_id
  `).bind(actor.subscriberId, coverage.governorateCode, coverage.mode, center?.latitude ?? null,
    center?.longitude ?? null, center ? coverage.radiusMeters : null);
  const remove = database.prepare(`
    DELETE FROM subscriber_coverage_district WHERE subscriber_id IN (${serviceAccount})
  `).bind(actor.subscriberId);
  const add = [...new Set(districts)].map(code => database.prepare(`
    INSERT INTO subscriber_coverage_district (subscriber_id, district_code)
    SELECT id, ?2 FROM (${serviceAccount})
  `).bind(actor.subscriberId, code));
  const [result] = await database.batch([upsert, remove, ...add]);
  return result.results.length === 1;
}
