CREATE TRIGGER subscriber_session_audit_insert
AFTER INSERT ON subscriber_session
BEGIN
    INSERT INTO subscriber_audit_event (id, subscriber_id, actor_type, actor_id, event_type, occurred_at)
    VALUES (lower(hex(randomblob(16))), NEW.subscriber_id, 'subscriber', NEW.subscriber_id,
        'session_issued', NEW.issued_at);
END;

CREATE TRIGGER subscriber_session_audit_replacement
AFTER UPDATE OF token_digest ON subscriber_session
WHEN NEW.token_digest <> OLD.token_digest
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
