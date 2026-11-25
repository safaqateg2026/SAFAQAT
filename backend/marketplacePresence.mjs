import {
  validCoordinates
} from "../shared/marketplaceRules.mjs";

function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export async function removeExpiredCourierLocations(
  database, now, limit = 100
) {
  if (
    !validTime(now) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) return 0;

  const result = await database.prepare(`
    DELETE FROM courier_marketplace_presence
    WHERE subscriber_id IN (
      SELECT subscriber_id
      FROM courier_marketplace_presence
      WHERE available = 1
        AND expires_at <= ?1
      ORDER BY expires_at
      LIMIT ?2
    )
    RETURNING subscriber_id
  `).bind(now, limit).all();

  return result.results.length;
}

export async function setCourierUnavailable(
  database, actor
) {
  if (
    !actor ||
    actor.role !== "courier" ||
    typeof actor.id !== "string"
  ) return false;

  const row = await database.prepare(`
    DELETE FROM courier_marketplace_presence
    WHERE subscriber_id = ?1
      AND EXISTS (
        SELECT 1 FROM subscriber
        WHERE id = ?1 AND role = 'courier'
      )
    RETURNING subscriber_id
  `).bind(actor.id).first();

  return Boolean(row);
}

// Lifetime must be supplied by approved server configuration.
// No production lifetime is assumed here.

export async function setCourierAvailable(
  database, actor, point, now, lifetime
) {
  if (
    !actor ||
    actor.role !== "courier" ||
    typeof actor.id !== "string" ||
    !validCoordinates(point) ||
    !validTime(now) ||
    !Number.isSafeInteger(lifetime) ||
    lifetime <= 0 ||
    !Number.isSafeInteger(now + lifetime)
  ) return false;

  const row = await database.prepare(`
    INSERT INTO courier_marketplace_presence (
      subscriber_id, available, latitude,
      longitude, updated_at, expires_at
    )
    SELECT s.id, 1, ?2, ?3, ?4, ?5
    FROM subscriber AS s
    JOIN subscriber_delivery AS d
      ON d.subscriber_id = s.id
    WHERE s.id = ?1
      AND s.role = 'courier'
      AND s.state = 'active'
    ON CONFLICT(subscriber_id) DO UPDATE SET
      available = 1,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at
    WHERE excluded.updated_at >=
      courier_marketplace_presence.updated_at
    RETURNING subscriber_id
  `).bind(
    actor.id,
    point.latitude,
    point.longitude,
    now,
    now + lifetime
  ).first();

  return Boolean(row);
}
