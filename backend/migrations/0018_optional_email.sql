
CREATE TABLE safaqat_email_migration_guard (
    subscriber_count INTEGER NOT NULL
        CHECK (subscriber_count = 0)
);

INSERT INTO safaqat_email_migration_guard
SELECT COUNT(*) FROM subscriber;

DROP TABLE safaqat_email_migration_guard;

DROP TRIGGER "completed_order_immutable";

DROP TRIGGER "completed_order_total_consistent";

DROP TRIGGER "completed_order_total_immutable";

DROP TRIGGER "completed_order_total_preserved";

DROP TRIGGER "consumer_retailer_favorite_insert_role";

DROP TRIGGER "consumer_retailer_favorite_no_reassignment";

DROP TRIGGER "courier_presence_insert_guard";

DROP TRIGGER "courier_presence_update_guard";

DROP TRIGGER "delivery_assignment_guard";

DROP TRIGGER "delivery_decline_guard";

DROP TRIGGER "delivery_location_cleanup";

DROP TRIGGER "delivery_location_insert_guard";

DROP TRIGGER "delivery_location_update_guard";

DROP TRIGGER "delivery_request_insert_guard";

DROP TRIGGER "delivery_request_update_guard";

DROP TRIGGER "identity_lookup_requires_approved_role";

DROP TRIGGER "marketplace_account_deactivation";

DROP TRIGGER "retailer_directory_identity_immutable";

DROP TRIGGER "retailer_directory_identity_role";

DROP TRIGGER "retailer_payment_method_role_guard";

DROP TRIGGER "retailer_payment_method_update_guard";

DROP TRIGGER "retailer_presence_insert_guard";

DROP TRIGGER "retailer_presence_update_guard";

DROP TRIGGER "subscriber_activation_requires_review_and_policies";

DROP TRIGGER "subscriber_archive_role";

DROP TRIGGER "subscriber_business_role";

DROP TRIGGER "subscriber_contact_requires_reverification";

DROP TRIGGER "subscriber_coverage_owner_immutable";

DROP TRIGGER "subscriber_coverage_role";

DROP TRIGGER "subscriber_delivery_role";

DROP TRIGGER "subscriber_immutable_identity";

DROP TRIGGER "subscriber_invalidate_session";

DROP TRIGGER "subscriber_record_registration_contact";

DROP TRIGGER "subscriber_session_audit_insert";

DROP TRIGGER "subscriber_session_audit_logout";

DROP TRIGGER "subscriber_session_audit_replacement";

DROP TRIGGER "subscriber_starts_incomplete";

DROP TRIGGER "verified_registration_claim_apply";

DROP TRIGGER "verified_registration_claim_guard";

DROP TRIGGER "verified_registration_claim_immutable";

DROP VIEW "marketplace_available_courier";

DROP VIEW "marketplace_visible_retailer";

CREATE TABLE subscriber_new (
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

    CHECK (email_verified_at IS NULL OR email IS NOT NULL),
    CHECK (state <> 'active' OR (phone_verified_at IS NOT NULL
        AND (email IS NULL OR email_verified_at IS NOT NULL)))
) STRICT;

INSERT INTO subscriber_new SELECT * FROM subscriber;

DROP TABLE subscriber;

ALTER TABLE subscriber_new RENAME TO subscriber;

CREATE TRIGGER completed_order_immutable
BEFORE UPDATE ON commerce_order
WHEN OLD.state IN ('cancelled', 'completed')
BEGIN
    SELECT RAISE(ABORT, 'terminal order is immutable');
END;

CREATE TRIGGER completed_order_total_consistent
BEFORE INSERT ON completed_order_total
WHEN NOT EXISTS (
    SELECT 1 FROM commerce_order WHERE id = NEW.order_id AND state = 'completed'
      AND buyer_id = NEW.buyer_id AND seller_id = NEW.seller_id AND created_at <= NEW.completed_at
)
BEGIN
    SELECT RAISE(ABORT, 'completion must match the order');
END;

CREATE TRIGGER completed_order_total_immutable
BEFORE UPDATE ON completed_order_total
BEGIN
    SELECT RAISE(ABORT, 'completion records are immutable');
END;

CREATE TRIGGER completed_order_total_preserved
BEFORE DELETE ON completed_order_total
BEGIN
    SELECT RAISE(ABORT, 'completion records must be retained');
END;

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

CREATE TRIGGER delivery_location_cleanup
AFTER UPDATE OF state ON delivery_request
WHEN NEW.state IN ('completed','cancelled')
BEGIN
  DELETE FROM delivery_request_location
  WHERE request_id = NEW.id;
END;

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

CREATE TRIGGER identity_lookup_requires_approved_role
BEFORE INSERT ON subscriber_identity_lookup
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id
    AND role IN ('supplier', 'retailer', 'courier'))
BEGIN
    SELECT RAISE(ABORT, 'identity lookup is restricted to verified-document roles');
END;

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

CREATE TRIGGER retailer_directory_identity_immutable
BEFORE UPDATE OF retailer_id, search_code ON retailer_directory_identity
WHEN NEW.retailer_id <> OLD.retailer_id OR NEW.search_code COLLATE BINARY <> OLD.search_code
BEGIN
    SELECT RAISE(ABORT, 'retailer code and membership are immutable');
END;

CREATE TRIGGER retailer_directory_identity_role
BEFORE INSERT ON retailer_directory_identity
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.retailer_id AND role = 'retailer')
BEGIN
    SELECT RAISE(ABORT, 'retailer code requires a retailer');
END;

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

CREATE TRIGGER subscriber_business_role
BEFORE INSERT ON subscriber_business
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id
    AND role IN ('supplier', 'retailer'))
BEGIN
    SELECT RAISE(ABORT, 'business profile requires supplier or retailer');
END;

CREATE TRIGGER subscriber_contact_requires_reverification
BEFORE UPDATE OF phone, email ON subscriber
WHEN (NEW.phone <> OLD.phone AND NEW.phone_verified_at IS NOT NULL)
    OR (NEW.email IS NOT OLD.email AND NEW.email_verified_at IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'new contact must be verified separately');
END;

CREATE TRIGGER subscriber_coverage_owner_immutable
BEFORE UPDATE OF subscriber_id ON subscriber_coverage
WHEN NEW.subscriber_id <> OLD.subscriber_id
BEGIN
    SELECT RAISE(ABORT, 'coverage owner is immutable');
END;

CREATE TRIGGER subscriber_coverage_role
BEFORE INSERT ON subscriber_coverage
WHEN NOT EXISTS (
    SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id AND role IN ('supplier', 'retailer', 'courier')
)
BEGIN
    SELECT RAISE(ABORT, 'coverage requires a service account');
END;

CREATE TRIGGER subscriber_delivery_role
BEFORE INSERT ON subscriber_delivery
WHEN NOT EXISTS (SELECT 1 FROM subscriber WHERE id = NEW.subscriber_id AND role = 'courier')
BEGIN
    SELECT RAISE(ABORT, 'delivery profile requires courier');
END;

CREATE TRIGGER subscriber_immutable_identity
BEFORE UPDATE OF id, role ON subscriber
WHEN NEW.id <> OLD.id OR NEW.role <> OLD.role
BEGIN
    SELECT RAISE(ABORT, 'subscriber identity and role are immutable');
END;

CREATE TRIGGER subscriber_invalidate_session
AFTER UPDATE OF state, phone, email, phone_verified_at, email_verified_at ON subscriber
WHEN (OLD.state = 'active' AND NEW.state <> 'active')
    OR NEW.phone <> OLD.phone OR NEW.email IS NOT OLD.email
    OR (OLD.phone_verified_at IS NOT NULL AND NEW.phone_verified_at IS NULL)
    OR (OLD.email_verified_at IS NOT NULL AND NEW.email_verified_at IS NULL)
BEGIN
    DELETE FROM subscriber_session WHERE subscriber_id = NEW.id;
END;

CREATE TRIGGER subscriber_record_registration_contact
AFTER UPDATE OF consumed_at ON subscriber_verification_challenge
WHEN OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL AND NEW.purpose = 'registration'
BEGIN
    UPDATE subscriber SET
        phone_verified_at = CASE WHEN NEW.channel = 'whatsapp'
            THEN coalesce(phone_verified_at, NEW.consumed_at) ELSE phone_verified_at END,
        email_verified_at = CASE WHEN NEW.channel = 'email'
            THEN coalesce(email_verified_at, NEW.consumed_at) ELSE email_verified_at END
    WHERE id = NEW.subscriber_id;
    INSERT INTO subscriber_registration_contact_receipt
        (challenge_id, subscriber_id, channel, verified_at)
    VALUES (NEW.id, NEW.subscriber_id, NEW.channel, NEW.consumed_at);
END;

CREATE TRIGGER subscriber_session_audit_insert
AFTER INSERT ON subscriber_session
BEGIN
    INSERT INTO subscriber_audit_event (id, subscriber_id, actor_type, actor_id, event_type, occurred_at)
    VALUES (lower(hex(randomblob(16))), NEW.subscriber_id, 'subscriber', NEW.subscriber_id,
        'session_issued', NEW.issued_at);
END;

CREATE TRIGGER subscriber_session_audit_logout
AFTER UPDATE OF revoked_at ON subscriber_session
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
    INSERT INTO subscriber_audit_event (id, subscriber_id, actor_type, actor_id, event_type, occurred_at)
    VALUES (lower(hex(randomblob(16))), NEW.subscriber_id, 'subscriber', NEW.subscriber_id,
        'session_revoked', NEW.revoked_at);
END;

CREATE TRIGGER subscriber_session_audit_replacement
AFTER UPDATE OF token_digest ON subscriber_session
WHEN NEW.token_digest <> OLD.token_digest
BEGIN
    INSERT INTO subscriber_audit_event (id, subscriber_id, actor_type, actor_id, event_type, occurred_at)
    VALUES (lower(hex(randomblob(16))), NEW.subscriber_id, 'subscriber', NEW.subscriber_id,
        'session_issued', NEW.issued_at);
END;

CREATE TRIGGER subscriber_starts_incomplete
BEFORE INSERT ON subscriber
WHEN NEW.state <> 'incomplete' OR NEW.phone_verified_at IS NOT NULL OR NEW.email_verified_at IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'registration starts unverified');
END;

CREATE TRIGGER verified_registration_claim_apply
AFTER INSERT ON verified_registration_claim
BEGIN
    UPDATE pending_registration
    SET claimed_at = NEW.claimed_at
    WHERE id = NEW.pending_id;

    UPDATE subscriber
    SET phone_verified_at = NEW.verified_at
    WHERE id = NEW.subscriber_id;
END;

CREATE TRIGGER verified_registration_claim_guard
BEFORE INSERT ON verified_registration_claim
WHEN NOT EXISTS (
    SELECT 1
    FROM pending_registration AS pending
    JOIN subscriber AS account
      ON account.id = NEW.subscriber_id
    WHERE pending.id = NEW.pending_id
      AND pending.verified_at = NEW.verified_at
      AND pending.claimed_at IS NULL
      AND pending.expires_at > NEW.claimed_at
      AND pending.verified_at <= NEW.claimed_at
      AND account.state = 'incomplete'
      AND account.phone_verified_at IS NULL
      AND account.created_at = NEW.claimed_at
)
BEGIN
    SELECT RAISE(ABORT, 'invalid verified registration claim');
END;

CREATE TRIGGER verified_registration_claim_immutable
BEFORE UPDATE ON verified_registration_claim
BEGIN
    SELECT RAISE(ABORT, 'registration receipt is immutable');
END;

CREATE VIEW marketplace_available_courier AS
SELECT
  p.subscriber_id,
  p.latitude,
  p.longitude,
  p.updated_at,
  p.expires_at
FROM courier_marketplace_presence AS p
JOIN subscriber AS s ON s.id = p.subscriber_id
WHERE p.available = 1
  AND s.role = 'courier'
  AND s.state = 'active'
  AND p.expires_at > unixepoch();

CREATE VIEW marketplace_visible_retailer AS
SELECT
  p.subscriber_id,
  p.updated_at
FROM retailer_marketplace_presence AS p
JOIN subscriber AS s ON s.id = p.subscriber_id
WHERE p.visible = 1
  AND s.role = 'retailer'
  AND s.state = 'active'
  AND EXISTS (
    SELECT 1
    FROM retailer_payment_method AS m
    WHERE m.subscriber_id = p.subscriber_id
  );
