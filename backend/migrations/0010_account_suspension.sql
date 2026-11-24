CREATE TABLE subscriber_suspension (
    access_event_id TEXT PRIMARY KEY NOT NULL REFERENCES administrator_access_event(id),
    subscriber_id TEXT NOT NULL REFERENCES subscriber(id),
    previous_state TEXT NOT NULL CHECK (previous_state IN
        ('incomplete', 'pending_review', 'requires_correction', 'active', 'rejected')),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    suspended_at INTEGER NOT NULL
) STRICT;

CREATE INDEX subscriber_suspension_history ON subscriber_suspension(subscriber_id, suspended_at);
