// The trusted location resolver supplies administrative codes for the point.
// Every discovery path uses the same retailer coverage predicate.
const candidates = `
  WITH candidates AS (
    SELECT retailer.id AS retailerId, business.name, identity.search_code AS searchCode,
      2 * 6371000 * asin(sqrt(min(1,
        pow(sin(radians(retailer.latitude - ?4) / 2), 2) +
        cos(radians(?4)) * cos(radians(retailer.latitude)) *
        pow(sin(radians(retailer.longitude - ?5) / 2), 2)
      ))) AS distanceMeters,
      favorite.retailer_id IS NOT NULL AS favorite
    FROM subscriber_coverage AS coverage
    JOIN subscriber AS retailer ON retailer.id = coverage.subscriber_id
    JOIN subscriber_business AS business ON business.subscriber_id = retailer.id
    JOIN retailer_directory_identity AS identity ON identity.retailer_id = retailer.id
    LEFT JOIN consumer_retailer_favorite AS favorite
      ON favorite.retailer_id = retailer.id AND favorite.consumer_id = ?1
    WHERE coverage.governorate_code = ?2 AND retailer.role = 'retailer' AND retailer.state = 'active'
      AND EXISTS (SELECT 1 FROM subscriber WHERE id = ?1 AND role = 'consumer' AND state = 'active')
      AND (
        coverage.mode = 'governorate'
        OR (coverage.mode = 'districts' AND EXISTS (
          SELECT 1 FROM subscriber_coverage_district
          WHERE subscriber_id = coverage.subscriber_id AND district_code = ?3
        ))
        OR (coverage.mode = 'radius' AND 2 * 6371000 * asin(sqrt(min(1,
          pow(sin(radians(coverage.center_latitude - ?4) / 2), 2) +
          cos(radians(?4)) * cos(radians(coverage.center_latitude)) *
          pow(sin(radians(coverage.center_longitude - ?5) / 2), 2)
        ))) <= coverage.radius_meters)
      )
  )
`;

function locationBindings(actor, location) {
  if (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
    || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180
    || typeof location.governorateCode !== "string" || !location.governorateCode
    || typeof location.districtCode !== "string" || !location.districtCode) {
    throw new TypeError("invalid discovery location");
  }
  return [actor.subscriberId, location.governorateCode, location.districtCode,
    location.latitude, location.longitude];
}

export async function discoverRetailers(database, actor, location, {
  search = "", favoritesOnly = false, after = null, limit = 20,
} = {}) {
  if (typeof search !== "string" || search.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 50
    || (after !== null && (!Number.isFinite(after.distanceMeters) || after.distanceMeters < 0
      || typeof after.retailerId !== "string"))) {
    throw new TypeError("invalid retailer query");
  }
  const result = await database.prepare(`
    ${candidates}
    SELECT retailerId, name, searchCode, distanceMeters, favorite FROM candidates
    WHERE (?6 = '' OR instr(lower(name), lower(?6)) > 0 OR searchCode = ?6 COLLATE NOCASE)
      AND (?7 = 0 OR favorite = 1)
      AND (?8 IS NULL OR (distanceMeters, retailerId) > (?8, ?9))
    ORDER BY distanceMeters, retailerId LIMIT ?10
  `).bind(...locationBindings(actor, location), search.trim(), Number(favoritesOnly),
    after?.distanceMeters ?? null, after?.retailerId ?? null, limit + 1).all();
  const retailers = result.results.slice(0, limit);
  const last = retailers.at(-1);
  return {
    retailers,
    next: result.results.length > limit ? { distanceMeters: last.distanceMeters, retailerId: last.retailerId } : null,
  };
}

export async function addFavorite(database, actor, location, retailerId, now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("invalid favorite timestamp");
  const row = await database.prepare(`
    ${candidates}
    INSERT INTO consumer_retailer_favorite (consumer_id, retailer_id, added_at)
    SELECT ?1, retailerId, ?7 FROM candidates WHERE retailerId = ?6
    ON CONFLICT DO NOTHING RETURNING retailer_id
  `).bind(...locationBindings(actor, location), retailerId, now).first();
  return Boolean(row);
}

export async function removeFavorite(database, actor, retailerId) {
  const row = await database.prepare(`
    DELETE FROM consumer_retailer_favorite WHERE consumer_id = ?1 AND retailer_id = ?2
      AND EXISTS (SELECT 1 FROM subscriber WHERE id = ?1 AND role = 'consumer' AND state = 'active')
    RETURNING retailer_id
  `).bind(actor.subscriberId, retailerId).first();
  return Boolean(row);
}
