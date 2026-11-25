import {
  VEHICLE_TYPES,
  canRequestDelivery,
  validCoordinates
} from "../shared/marketplaceRules.mjs";

function validId(value) {
  return typeof value === "string" &&
    value.length > 0 && value.length <= 100;
}

function validTime(now) {
  return Number.isSafeInteger(now) && now >= 0;
}

// Actor identity must come from an authenticated server session.
// These functions must not be exposed directly to public requests.

export async function createDeliveryRequest(
  database, actor, input, now
) {
  if (
    !actor ||
    !validId(actor.id) ||
    !canRequestDelivery(actor.role) ||
    !validTime(now) ||
    !input ||
    !VEHICLE_TYPES.includes(input.vehicleType) ||
    !validCoordinates(input.pickup) ||
    !validCoordinates(input.destination)
  ) return null;

  const id = crypto.randomUUID();

  await database.batch([
    database.prepare(`
      INSERT INTO delivery_request (
        id, requester_id, vehicle_type, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?4)
    `).bind(id, actor.id, input.vehicleType, now),

    database.prepare(`
      INSERT INTO delivery_request_location (
        request_id,
        pickup_latitude,
        pickup_longitude,
        destination_latitude,
        destination_longitude,
        created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(
      id,
      input.pickup.latitude,
      input.pickup.longitude,
      input.destination.latitude,
      input.destination.longitude,
      now
    )
  ]);

  return { id, state: "pending" };
}

export async function acceptDeliveryRequest(
  database, actor, requestId, now
) {
  if (
    !actor ||
    actor.role !== "courier" ||
    !validId(actor.id) ||
    !validId(requestId) ||
    !validTime(now)
  ) return null;

  return await database.prepare(`
    UPDATE delivery_request
    SET state = 'assigned',
        courier_id = ?1,
        updated_at = ?3
    WHERE id = ?2
      AND state = 'pending'
      AND updated_at <= ?3
      AND EXISTS (
        SELECT 1 FROM subscriber
        WHERE id = delivery_request.requester_id
          AND state = 'active'
      )
      AND EXISTS (
        SELECT 1 FROM delivery_request_location
        WHERE request_id = delivery_request.id
      )
      AND EXISTS (
        SELECT 1
        FROM subscriber AS s
        JOIN subscriber_delivery AS d
          ON d.subscriber_id = s.id
        JOIN courier_marketplace_presence AS p
          ON p.subscriber_id = s.id
        WHERE s.id = ?1
          AND s.role = 'courier'
          AND s.state = 'active'
          AND d.vehicle_type = delivery_request.vehicle_type
          AND p.available = 1
          AND p.updated_at <= ?3
          AND p.expires_at > ?3
      )
      AND NOT EXISTS (
        SELECT 1 FROM delivery_request AS other
        WHERE other.courier_id = ?1
          AND other.state IN ('assigned','picked_up')
      )
    RETURNING id, state
  `).bind(actor.id, requestId, now).first();
}

export async function declineDeliveryRequest(
  database, actor, requestId, now
) {
  if (
    !actor ||
    actor.role !== "courier" ||
    !validId(actor.id) ||
    !validId(requestId) ||
    !validTime(now)
  ) return false;

  const row = await database.prepare(`
    INSERT INTO delivery_request_decline (
      request_id, courier_id, declined_at
    )
    SELECT r.id, s.id, ?3
    FROM delivery_request AS r
    JOIN subscriber AS s ON s.id = ?1
    JOIN subscriber_delivery AS d ON d.subscriber_id = s.id
    WHERE r.id = ?2
      AND r.state = 'pending'
      AND r.created_at <= ?3
      AND s.role = 'courier'
      AND s.state = 'active'
      AND d.vehicle_type = r.vehicle_type
    ON CONFLICT(request_id, courier_id) DO NOTHING
    RETURNING request_id
  `).bind(actor.id, requestId, now).first();

  return Boolean(row);
}
