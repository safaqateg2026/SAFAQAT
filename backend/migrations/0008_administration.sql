CREATE TABLE administrator_permission (
    administrator_id TEXT NOT NULL,
    permission TEXT NOT NULL CHECK (permission IN
        ('subscriber_search', 'identity_search', 'archive_read', 'support_write', 'account_suspend')),
    PRIMARY KEY (administrator_id, permission)
) STRICT;

CREATE TABLE administrator_access_event (
    id TEXT PRIMARY KEY NOT NULL,
    administrator_id TEXT NOT NULL,
    subscriber_id TEXT REFERENCES subscriber(id),
    action TEXT NOT NULL CHECK (action IN ('subscriber_search', 'identity_search', 'archive_read', 'support_write', 'account_suspend')),
    occurred_at INTEGER NOT NULL
) STRICT;

CREATE INDEX administrator_access_by_subscriber ON administrator_access_event(subscriber_id, occurred_at);

CREATE TABLE subscriber_identity_lookup (
    subscriber_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriber(id),
    lookup_digest TEXT NOT NULL CHECK (length(lookup_digest) = 64 AND lookup_digest NOT GLOB '*[^0-9a-f]*')
) STRICT;

CREATE INDEX subscriber_identity_by_digest ON subscriber_identity_lookup(lookup_digest, subscriber_id);

CREATE TRIGGER identity_lookup_requires_approved_role
BEFORE INSERT ON subscriber_identity_lookup
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id
    AND role IN ('supplier', 'retailer', 'courier'))
BEGIN
    SELECT RAISE(ABORT, 'identity lookup is restricted to verified-document roles');
END;

CREATE TABLE subscriber_support_case (
    id TEXT PRIMARY KEY NOT NULL,
    subscriber_id TEXT NOT NULL REFERENCES subscriber(id),
    order_id TEXT REFERENCES commerce_order(id),
    kind TEXT NOT NULL CHECK (kind IN ('complaint', 'violation')),
    category TEXT,
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    administrator_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX subscriber_support_by_account ON subscriber_support_case(subscriber_id, created_at, id);

CREATE TABLE subscriber_support_action (
    id TEXT PRIMARY KEY NOT NULL,
    case_id TEXT NOT NULL REFERENCES subscriber_support_case(id),
    administrator_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('note', 'appeal', 'resolution', 'suspension')),
    details TEXT NOT NULL CHECK (length(trim(details)) > 0),
    occurred_at INTEGER NOT NULL
) STRICT;

CREATE INDEX subscriber_support_actions_by_case ON subscriber_support_action(case_id, occurred_at, id);
