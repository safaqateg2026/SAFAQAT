CREATE TABLE retailer_directory_identity (
    retailer_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriber(id),
    search_code TEXT NOT NULL UNIQUE COLLATE NOCASE
        CHECK (length(search_code) > 0 AND search_code = trim(search_code))
) STRICT;

CREATE TRIGGER retailer_directory_identity_role
BEFORE INSERT ON retailer_directory_identity
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.retailer_id AND role = 'retailer')
BEGIN
    SELECT RAISE(ABORT, 'retailer code requires a retailer');
END;

CREATE TRIGGER retailer_directory_identity_immutable
BEFORE UPDATE OF retailer_id, search_code ON retailer_directory_identity
WHEN NEW.retailer_id <> OLD.retailer_id OR NEW.search_code COLLATE BINARY <> OLD.search_code
BEGIN
    SELECT RAISE(ABORT, 'retailer code and membership are immutable');
END;

CREATE TABLE consumer_retailer_favorite (
    consumer_id TEXT NOT NULL REFERENCES subscriber(id),
    retailer_id TEXT NOT NULL REFERENCES retailer_directory_identity(retailer_id),
    added_at INTEGER NOT NULL,
    PRIMARY KEY (consumer_id, retailer_id)
) STRICT;

CREATE TRIGGER consumer_retailer_favorite_insert_role
BEFORE INSERT ON consumer_retailer_favorite
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.consumer_id
    AND role = 'consumer' AND state = 'active')
    OR NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.retailer_id AND state = 'active')
BEGIN
    SELECT RAISE(ABORT, 'favorites require an active consumer and retailer');
END;

CREATE TRIGGER consumer_retailer_favorite_no_reassignment
BEFORE UPDATE OF consumer_id, retailer_id ON consumer_retailer_favorite
WHEN NEW.consumer_id <> OLD.consumer_id OR NEW.retailer_id <> OLD.retailer_id
BEGIN
    SELECT RAISE(ABORT, 'favorite membership is immutable');
END;

CREATE INDEX consumer_favorites_by_date
ON consumer_retailer_favorite(consumer_id, added_at DESC, retailer_id);
