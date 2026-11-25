CREATE TABLE delivery_request (
  id TEXT PRIMARY KEY NOT NULL,
  requester_id TEXT NOT NULL REFERENCES subscriber(id),
  vehicle_type TEXT NOT NULL
    CHECK (vehicle_type IN ('rider','car','truck','bicycle')),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending','assigned','picked_up','completed','cancelled'
    )),
  courier_id TEXT REFERENCES subscriber(id),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  CHECK (requester_id IS NOT courier_id),
  CHECK (
    (state = 'pending' AND courier_id IS NULL)
    OR
    (state IN ('assigned','picked_up','completed')
      AND courier_id IS NOT NULL)
    OR state = 'cancelled'
  )
) STRICT;

CREATE INDEX delivery_request_by_requester
ON delivery_request(requester_id, created_at);

CREATE INDEX delivery_request_pending_category
ON delivery_request(vehicle_type, created_at)
WHERE state = 'pending';

CREATE UNIQUE INDEX courier_single_open_delivery
ON delivery_request(courier_id)
WHERE state IN ('assigned','picked_up');

CREATE TRIGGER delivery_request_insert_guard
BEFORE INSERT ON delivery_request
WHEN NEW.state <> 'pending'
  OR NEW.courier_id IS NOT NULL
  OR NOT EXISTS (
    SELECT 1 FROM subscriber
    WHERE id = NEW.requester_id
      AND role IN ('supplier','retailer','consumer')
      AND state = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid_delivery_request');
END;

CREATE TRIGGER delivery_request_update_guard
BEFORE UPDATE ON delivery_request
WHEN NEW.id <> OLD.id
  OR NEW.requester_id <> OLD.requester_id
  OR NEW.vehicle_type <> OLD.vehicle_type
  OR NEW.created_at <> OLD.created_at
  OR NEW.updated_at < OLD.updated_at
  OR (
    OLD.courier_id IS NOT NULL
    AND NEW.courier_id IS NOT OLD.courier_id
  )
  OR NOT (
    (OLD.state = 'pending'
      AND NEW.state IN ('assigned','cancelled'))
    OR
    (OLD.state = 'assigned'
      AND NEW.state IN ('picked_up','cancelled'))
    OR
    (OLD.state = 'picked_up'
      AND NEW.state = 'completed')
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid_delivery_transition');
END;

CREATE TRIGGER delivery_assignment_guard
BEFORE UPDATE ON delivery_request
WHEN NEW.state = 'assigned'
  AND (
    NOT EXISTS (
      SELECT 1 FROM subscriber
      WHERE id = NEW.requester_id
        AND state = 'active'
    )
    OR NOT EXISTS (
      SELECT 1 FROM delivery_request_location
      WHERE request_id = NEW.id
    )
    OR NOT EXISTS (
    SELECT 1
    FROM subscriber AS s
    JOIN subscriber_delivery AS d
      ON d.subscriber_id = s.id
    JOIN courier_marketplace_presence AS p
      ON p.subscriber_id = s.id
    WHERE s.id = NEW.courier_id
      AND s.role = 'courier'
      AND s.state = 'active'
      AND d.vehicle_type = NEW.vehicle_type
      AND p.available = 1
      AND p.updated_at <= NEW.updated_at
      AND p.expires_at > NEW.updated_at
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'courier_not_eligible');
END;

CREATE TABLE delivery_request_location (
  request_id TEXT PRIMARY KEY NOT NULL
    REFERENCES delivery_request(id) ON DELETE CASCADE,
  pickup_latitude REAL NOT NULL
    CHECK (pickup_latitude BETWEEN -90 AND 90),
  pickup_longitude REAL NOT NULL
    CHECK (pickup_longitude BETWEEN -180 AND 180),
  destination_latitude REAL NOT NULL
    CHECK (destination_latitude BETWEEN -90 AND 90),
  destination_longitude REAL NOT NULL
    CHECK (destination_longitude BETWEEN -180 AND 180),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
) STRICT;

CREATE TRIGGER delivery_location_insert_guard
BEFORE INSERT ON delivery_request_location
WHEN NOT EXISTS (
  SELECT 1 FROM delivery_request
  WHERE id = NEW.request_id
    AND state = 'pending'
    AND created_at <= NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'invalid_delivery_location');
END;

CREATE TRIGGER delivery_location_update_guard
BEFORE UPDATE ON delivery_request_location
BEGIN
  SELECT RAISE(ABORT, 'delivery_location_immutable');
END;

CREATE TRIGGER delivery_location_cleanup
AFTER UPDATE OF state ON delivery_request
WHEN NEW.state IN ('completed','cancelled')
BEGIN
  DELETE FROM delivery_request_location
  WHERE request_id = NEW.id;
END;

CREATE TABLE delivery_request_decline (
  request_id TEXT NOT NULL REFERENCES delivery_request(id),
  courier_id TEXT NOT NULL REFERENCES subscriber(id),
  declined_at INTEGER NOT NULL CHECK (declined_at >= 0),
  PRIMARY KEY (request_id, courier_id)
) STRICT;

CREATE TRIGGER delivery_decline_guard
BEFORE INSERT ON delivery_request_decline
WHEN NOT EXISTS (
  SELECT 1
  FROM delivery_request AS r
  JOIN subscriber AS s ON s.id = NEW.courier_id
  JOIN subscriber_delivery AS d ON d.subscriber_id = s.id
  WHERE r.id = NEW.request_id
    AND r.state = 'pending'
    AND s.role = 'courier'
    AND s.state = 'active'
    AND d.vehicle_type = r.vehicle_type
    AND NEW.declined_at >= r.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'invalid_delivery_decline');
END;
