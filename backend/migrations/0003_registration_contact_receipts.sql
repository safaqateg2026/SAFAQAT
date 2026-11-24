CREATE TABLE subscriber_registration_contact_receipt (
    challenge_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriber_verification_challenge(id),
    subscriber_id TEXT NOT NULL REFERENCES subscriber(id),
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
    verified_at INTEGER NOT NULL
) STRICT;

CREATE INDEX subscriber_registration_contact_history
ON subscriber_registration_contact_receipt(subscriber_id, verified_at);

-- The authenticated provider path consumes the challenge with a guarded UPDATE.
-- Contact verification and its receipt succeed or roll back with that UPDATE.
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
