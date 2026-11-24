-- Apply only to the verified subscriber database. Do not apply to the catalog database.
CREATE TABLE subscriber (
    id TEXT PRIMARY KEY NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('supplier', 'retailer', 'consumer', 'courier')),
    state TEXT NOT NULL DEFAULT 'incomplete' CHECK (state IN
        ('incomplete', 'pending_review', 'requires_correction', 'active', 'rejected', 'suspended')),
    phone TEXT NOT NULL UNIQUE CHECK (phone GLOB '+201[0-9]*'
        AND substr(phone, 2) NOT GLOB '*[^0-9]*' AND length(phone) = 13),
    email TEXT CHECK (email IS NULL OR length(trim(email)) > 0),
    phone_verified_at INTEGER,
    email_verified_at INTEGER,
    full_name TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
    birth_date TEXT NOT NULL CHECK (birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    governorate_code TEXT NOT NULL,
    district_code TEXT NOT NULL,
    address TEXT NOT NULL CHECK (length(trim(address)) > 0),
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
    created_at INTEGER NOT NULL,
    CHECK (role = 'consumer' OR email IS NOT NULL),
    CHECK (email_verified_at IS NULL OR email IS NOT NULL),
    CHECK (state <> 'active' OR (phone_verified_at IS NOT NULL
        AND (email IS NULL OR email_verified_at IS NOT NULL)))
) STRICT;

CREATE TRIGGER subscriber_immutable_identity
BEFORE UPDATE OF id, role ON subscriber
WHEN NEW.id <> OLD.id OR NEW.role <> OLD.role
BEGIN
    SELECT RAISE(ABORT, 'subscriber identity and role are immutable');
END;

CREATE TRIGGER subscriber_contact_requires_reverification
BEFORE UPDATE OF phone, email ON subscriber
WHEN (NEW.phone <> OLD.phone AND NEW.phone_verified_at IS NOT NULL)
    OR (NEW.email IS NOT OLD.email AND NEW.email_verified_at IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'new contact must be verified separately');
END;

CREATE TABLE subscriber_business (
    subscriber_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriber(id),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    activity_code TEXT NOT NULL,
    premises_address TEXT NOT NULL CHECK (length(trim(premises_address)) > 0)
) STRICT;

CREATE TRIGGER subscriber_business_role
BEFORE INSERT ON subscriber_business
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id
    AND role IN ('supplier', 'retailer'))
BEGIN
    SELECT RAISE(ABORT, 'business profile requires supplier or retailer');
END;

CREATE TABLE subscriber_delivery (
    subscriber_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriber(id),
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('rider', 'car', 'truck')),
    plate_number TEXT
) STRICT;

CREATE TRIGGER subscriber_delivery_role
BEFORE INSERT ON subscriber_delivery
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id AND role = 'courier')
BEGIN
    SELECT RAISE(ABORT, 'delivery profile requires courier');
END;

CREATE TABLE subscriber_policy_acceptance (
    subscriber_id TEXT NOT NULL REFERENCES subscriber(id),
    policy TEXT NOT NULL CHECK (policy IN ('terms', 'privacy', 'commission', 'sales_purchase', 'delivery')),
    version TEXT NOT NULL,
    accepted_at INTEGER NOT NULL,
    PRIMARY KEY (subscriber_id, policy, version)
) STRICT;

CREATE TABLE subscriber_verification_challenge (
    id TEXT PRIMARY KEY NOT NULL,
    subscriber_id TEXT NOT NULL REFERENCES subscriber(id),
    purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'login', 'recovery', 'contact_change')),
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
    proof_digest TEXT NOT NULL UNIQUE CHECK (length(proof_digest) = 64),
    target_digest TEXT NOT NULL CHECK (length(target_digest) = 64),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
    consumed_at INTEGER CHECK (consumed_at >= created_at AND consumed_at < expires_at)
) STRICT;

CREATE TABLE subscriber_session (
    subscriber_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriber(id),
    token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
    device_label TEXT,
    issued_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= issued_at AND last_seen_at < expires_at),
    expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
    revoked_at INTEGER CHECK (revoked_at >= issued_at)
) STRICT;

-- Each subscriber is the root of their logical archive. The object key is
-- opaque and must be resolved only by an authorized server-side storage adapter.
CREATE TABLE subscriber_archive_document (
    id TEXT PRIMARY KEY NOT NULL,
    subscriber_id TEXT NOT NULL REFERENCES subscriber(id),
    kind TEXT NOT NULL CHECK (kind IN ('id_front', 'id_back', 'identity_selfie',
        'business_facade', 'vehicle_photo', 'driving_license', 'vehicle_license', 'additional')),
    object_key TEXT NOT NULL UNIQUE CHECK (length(object_key) = 64 AND object_key NOT GLOB '*[^0-9a-f]*'),
    version INTEGER NOT NULL CHECK (version > 0),
    uploaded_at INTEGER NOT NULL,
    UNIQUE (subscriber_id, kind, version)
) STRICT;

CREATE TRIGGER subscriber_archive_role
BEFORE INSERT ON subscriber_archive_document
WHEN NOT EXISTS (
    SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id AND (
        (role IN ('supplier', 'retailer', 'courier') AND NEW.kind IN ('id_front', 'id_back', 'identity_selfie', 'additional'))
        OR (role IN ('supplier', 'retailer') AND NEW.kind = 'business_facade')
        OR (role = 'courier' AND NEW.kind IN ('vehicle_photo', 'driving_license', 'vehicle_license'))
    )
)
BEGIN
    SELECT RAISE(ABORT, 'document kind is not approved for subscriber role');
END;

CREATE TABLE subscriber_audit_event (
    id TEXT PRIMARY KEY NOT NULL,
    subscriber_id TEXT NOT NULL REFERENCES subscriber(id),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('subscriber', 'administrator', 'system')),
    actor_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('registered', 'review_recorded',
        'state_changed', 'document_accessed', 'session_issued', 'session_revoked', 'recovery_completed')),
    occurred_at INTEGER NOT NULL
) STRICT;

CREATE INDEX subscriber_audit_by_account ON subscriber_audit_event(subscriber_id, occurred_at);

CREATE TABLE subscriber_verification_review (
    id TEXT PRIMARY KEY NOT NULL,
    subscriber_id TEXT NOT NULL REFERENCES subscriber(id),
    administrator_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'correction', 'rejected')),
    reason TEXT CHECK (decision = 'approved' OR length(trim(coalesce(reason, ''))) > 0),
    reviewed_at INTEGER NOT NULL,
    UNIQUE (subscriber_id, reviewed_at)
) STRICT;

CREATE TRIGGER subscriber_starts_incomplete
BEFORE INSERT ON subscriber
WHEN NEW.state <> 'incomplete' OR NEW.phone_verified_at IS NOT NULL OR NEW.email_verified_at IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'registration starts unverified');
END;

CREATE TRIGGER subscriber_activation_requires_review_and_policies
BEFORE UPDATE OF state ON subscriber
WHEN NEW.state = 'active' AND OLD.state <> 'active'
BEGIN
    SELECT RAISE(ABORT, 'required policy acceptances are missing')
    WHERE EXISTS (
        SELECT value FROM json_each('["terms","privacy","commission","sales_purchase","delivery"]')
        WHERE (value NOT IN ('sales_purchase', 'delivery')
            OR (value = 'sales_purchase' AND NEW.role <> 'courier')
            OR (value = 'delivery' AND NEW.role IN ('consumer', 'courier')))
        AND NOT EXISTS (SELECT 1 FROM subscriber_policy_acceptance
            WHERE subscriber_id = NEW.id AND policy = value)
    );

    SELECT RAISE(ABORT, 'latest administrative review must approve activation')
    WHERE NEW.role <> 'consumer' AND (
        SELECT decision FROM subscriber_verification_review
        WHERE subscriber_id = NEW.id ORDER BY reviewed_at DESC LIMIT 1
    ) IS NOT 'approved';
END;

CREATE INDEX subscriber_archive_by_account ON subscriber_archive_document(subscriber_id, uploaded_at);

-- A restored account must authenticate again after losing active status or
-- changing its verified contact. Audit evidence belongs in the event table.
CREATE TRIGGER subscriber_invalidate_session
AFTER UPDATE OF state, phone, email, phone_verified_at, email_verified_at ON subscriber
WHEN (OLD.state = 'active' AND NEW.state <> 'active')
    OR NEW.phone <> OLD.phone OR NEW.email IS NOT OLD.email
    OR (OLD.phone_verified_at IS NOT NULL AND NEW.phone_verified_at IS NULL)
    OR (OLD.email_verified_at IS NOT NULL AND NEW.email_verified_at IS NULL)
BEGIN
    DELETE FROM subscriber_session WHERE subscriber_id = NEW.id;
END;
