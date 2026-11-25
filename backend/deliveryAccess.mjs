// Internal service only.
// Actor identity must be derived from a verified server session.

function validActor(actor) {
  return actor &&
    typeof actor.id === "string" &&
    actor.id.length > 0 &&
    actor.id.length <= 100 &&
    ["supplier", "retailer", "consumer", "courier"]
      .includes(actor.role);
}

function validRequestId(id) {
  return typeof id === "string" &&
    id.length > 0 &&
    id.length <= 100;
}

export async function readPrivateDeliveryRoute(
  database, actor, requestId
) {
  if (!validActor(actor) || !validRequestId(requestId)) {
    return null;
  }

  return await database.prepare(`
    SELECT
      r.id,
      r.state,
      l.pickup_latitude AS pickupLatitude,
      l.pickup_longitude AS pickupLongitude,
      l.destination_latitude AS destinationLatitude,
      l.destination_longitude AS destinationLongitude
    FROM delivery_request AS r
    JOIN delivery_request_location AS l
      ON l.request_id = r.id
    JOIN subscriber AS s ON s.id = ?1
    WHERE r.id = ?2
      AND s.role = ?3
      AND s.state = 'active'
      AND (
        (
          r.requester_id = s.id
          AND s.role IN ('supplier','retailer','consumer')
          AND r.state IN ('pending','assigned','picked_up')
        )
        OR
        (
          r.courier_id = s.id
          AND s.role = 'courier'
          AND r.state IN ('assigned','picked_up')
        )
      )
  `).bind(actor.id, requestId, actor.role).first();
}

export async function readOwnDeliveryHistory(
  database, actor, limit = 20
) {
  if (
    !validActor(actor) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) return [];

  const result = await database.prepare(`
    SELECT
      r.id,
      r.vehicle_type AS vehicleType,
      r.state,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt
    FROM delivery_request AS r
    JOIN subscriber AS s ON s.id = ?1
    WHERE s.state = 'active'
      AND s.role = ?2
      AND (
        (
          r.requester_id = s.id
          AND s.role IN ('supplier','retailer','consumer')
        )
        OR
        (
          r.courier_id = s.id
          AND s.role = 'courier'
        )
      )
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ?3
  `).bind(actor.id, actor.role, limit).all();

  return result.results;
}
