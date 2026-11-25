-- Forward-only vehicle category expansion. Existing rows and integrity objects are preserved.
CREATE TABLE subscriber_delivery_next (
    subscriber_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriber(id),
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('rider', 'car', 'truck', 'bicycle')),
    plate_number TEXT,
    plate_letters TEXT,
    plate_digits TEXT
) STRICT;
INSERT INTO subscriber_delivery_next
    (subscriber_id, vehicle_type, plate_number, plate_letters, plate_digits)
SELECT subscriber_id, vehicle_type, plate_number, plate_letters, plate_digits FROM subscriber_delivery;
DROP TABLE subscriber_delivery;
ALTER TABLE subscriber_delivery_next RENAME TO subscriber_delivery;
CREATE TRIGGER subscriber_delivery_role
BEFORE INSERT ON subscriber_delivery
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id AND role = 'courier')
BEGIN
    SELECT RAISE(ABORT, 'delivery profile requires courier');
END;
