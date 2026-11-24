CREATE TABLE subscriber_auth_rate_limit (
    action TEXT NOT NULL CHECK (action IN ('challenge_issue', 'challenge_verify', 'account_recovery')),
    subject_digest TEXT NOT NULL
        CHECK (length(subject_digest) = 64 AND subject_digest NOT GLOB '*[^0-9a-f]*'),
    window_start INTEGER NOT NULL CHECK (window_start >= 0),
    attempts INTEGER NOT NULL CHECK (attempts > 0),
    PRIMARY KEY (action, subject_digest)
) STRICT;
