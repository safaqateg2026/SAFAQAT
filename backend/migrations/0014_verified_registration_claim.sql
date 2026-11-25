CREATE TABLE verified_registration_claim (
    pending_id TEXT PRIMARY KEY NOT NULL,
    subscriber_id TEXT NOT NULL UNIQUE
        REFERENCES subscriber(id),
    verified_at INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL
        CHECK (claimed_at >= verified_at)
) STRICT;

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

CREATE TRIGGER verified_registration_claim_immutable
BEFORE UPDATE ON verified_registration_claim
BEGIN
    SELECT RAISE(ABORT, 'registration receipt is immutable');
END;
