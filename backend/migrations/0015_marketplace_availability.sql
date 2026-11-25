CREATE TABLE retailer_payment_method (
  subscriber_id TEXT NOT NULL
    REFERENCES subscriber(id) ON DELETE CASCADE,
  method TEXT NOT NULL
    CHECK (method IN ('cash','wallet','instapay','fawry')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (subscriber_id, method)
) STRICT;

CREATE TRIGGER retailer_payment_method_role_guard
BEFORE INSERT ON retailer_payment_method
WHEN NOT EXISTS (
  SELECT 1 FROM subscriber
  WHERE id = NEW.subscriber_id
    AND role = 'retailer'
    AND state = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'retailer_not_eligible');
END;

CREATE TRIGGER retailer_payment_method_update_guard
BEFORE UPDATE ON retailer_payment_method
BEGIN
  SELECT RAISE(ABORT, 'replace_payment_method');
END;

CREATE TABLE retailer_marketplace_presence (
  subscriber_id TEXT PRIMARY KEY
    REFERENCES subscriber(id) ON DELETE CASCADE,
  visible INTEGER NOT NULL DEFAULT 0
    CHECK (visible IN (0,1)),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
) STRICT;

CREATE TRIGGER retailer_presence_insert_guard
BEFORE INSERT ON retailer_marketplace_presence
WHEN NOT EXISTS (
  SELECT 1 FROM subscriber
  WHERE id = NEW.subscriber_id
    AND role = 'retailer'
    AND state = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'retailer_not_eligible');
END;

CREATE TRIGGER retailer_presence_update_guard
BEFORE UPDATE ON retailer_marketplace_presence
WHEN NEW.subscriber_id <> OLD.subscriber_id
  OR NEW.updated_at < OLD.updated_at
  OR (
    NEW.visible = 1 AND NOT EXISTS (
      SELECT 1 FROM subscriber
      WHERE id = NEW.subscriber_id
        AND role = 'retailer'
        AND state = 'active'
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid_retailer_presence');
END;

CREATE TABLE courier_marketplace_presence (
  subscriber_id TEXT PRIMARY KEY
    REFERENCES subscriber(id) ON DELETE CASCADE,
  available INTEGER NOT NULL DEFAULT 0
    CHECK (available IN (0,1)),
  latitude REAL,
  longitude REAL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  expires_at INTEGER,
  CHECK (
    (
      available = 0
      AND latitude IS NULL
      AND longitude IS NULL
      AND expires_at IS NULL
    )
    OR
    (
      available = 1
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
      AND expires_at IS NOT NULL
      AND expires_at > updated_at
    )
  )
) STRICT;

CREATE TRIGGER courier_presence_insert_guard
BEFORE INSERT ON courier_marketplace_presence
WHEN NOT EXISTS (
  SELECT 1 FROM subscriber
  WHERE id = NEW.subscriber_id
    AND role = 'courier'
    AND state = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'courier_not_eligible');
END;

CREATE TRIGGER courier_presence_update_guard
BEFORE UPDATE ON courier_marketplace_presence
WHEN NEW.subscriber_id <> OLD.subscriber_id
  OR NEW.updated_at < OLD.updated_at
  OR (
    NEW.available = 1 AND NOT EXISTS (
      SELECT 1 FROM subscriber
      WHERE id = NEW.subscriber_id
        AND role = 'courier'
        AND state = 'active'
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid_courier_presence');
END;

CREATE INDEX courier_presence_expiry_idx
ON courier_marketplace_presence(expires_at)
WHERE available = 1;

CREATE INDEX courier_presence_location_idx
ON courier_marketplace_presence(latitude, longitude)
WHERE available = 1;

CREATE TRIGGER marketplace_account_deactivation
AFTER UPDATE OF state ON subscriber
WHEN NEW.state <> 'active'
BEGIN
  DELETE FROM courier_marketplace_presence
    WHERE subscriber_id = NEW.id;

  UPDATE retailer_marketplace_presence
    SET visible = 0
    WHERE subscriber_id = NEW.id;
END;
