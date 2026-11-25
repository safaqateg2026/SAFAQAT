CREATE TABLE pending_registration (
    id TEXT PRIMARY KEY NOT NULL,
    phone_digest TEXT NOT NULL CHECK (
        length(phone_digest) = 64
        AND phone_digest NOT GLOB '*[^0-9a-f]*'
    ),
    proof_digest TEXT NOT NULL UNIQUE CHECK (
        length(proof_digest) = 64
        AND proof_digest NOT GLOB '*[^0-9a-f]*'
    ),
    browser_digest TEXT NOT NULL UNIQUE CHECK (
        length(browser_digest) = 64
        AND browser_digest NOT GLOB '*[^0-9a-f]*'
    ),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER NOT NULL CHECK (
        expires_at > created_at
        AND expires_at - created_at <= 1800
    ),
    verified_at INTEGER CHECK (
        verified_at >= created_at
        AND verified_at < expires_at
    ),
    claimed_at INTEGER CHECK (
        claimed_at IS NULL OR (
            verified_at IS NOT NULL
            AND claimed_at >= verified_at
            AND claimed_at < expires_at
        )
    )
) STRICT;

CREATE INDEX pending_registration_expiry
ON pending_registration(expires_at);

CREATE INDEX pending_registration_phone
ON pending_registration(phone_digest, expires_at);
