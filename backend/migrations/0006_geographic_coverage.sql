CREATE TABLE subscriber_coverage (
    subscriber_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriber(id),
    governorate_code TEXT NOT NULL CHECK (length(trim(governorate_code)) > 0),
    mode TEXT NOT NULL CHECK (mode IN ('radius', 'districts', 'governorate')),
    center_latitude REAL,
    center_longitude REAL,
    radius_meters INTEGER,
    CHECK (
        (mode = 'radius' AND center_latitude IS NOT NULL AND center_longitude IS NOT NULL
            AND radius_meters IS NOT NULL AND center_latitude BETWEEN -90 AND 90
            AND center_longitude BETWEEN -180 AND 180 AND radius_meters > 0)
        OR (mode <> 'radius' AND center_latitude IS NULL AND center_longitude IS NULL AND radius_meters IS NULL)
    )
) STRICT;

CREATE TRIGGER subscriber_coverage_role
BEFORE INSERT ON subscriber_coverage
WHEN NOT EXISTS (
    SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id AND role IN ('supplier', 'retailer', 'courier')
)
BEGIN
    SELECT RAISE(ABORT, 'coverage requires a service account');
END;

CREATE TRIGGER subscriber_coverage_owner_immutable
BEFORE UPDATE OF subscriber_id ON subscriber_coverage
WHEN NEW.subscriber_id <> OLD.subscriber_id
BEGIN
    SELECT RAISE(ABORT, 'coverage owner is immutable');
END;

CREATE TABLE subscriber_coverage_district (
    subscriber_id TEXT NOT NULL REFERENCES subscriber_coverage(subscriber_id) ON DELETE CASCADE,
    district_code TEXT NOT NULL CHECK (length(trim(district_code)) > 0),
    PRIMARY KEY (subscriber_id, district_code)
) STRICT;

CREATE INDEX subscriber_coverage_by_governorate ON subscriber_coverage(governorate_code, subscriber_id);
