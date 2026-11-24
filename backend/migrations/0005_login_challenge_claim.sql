ALTER TABLE subscriber_verification_challenge ADD COLUMN login_claim TEXT
    CHECK (login_claim IS NULL OR (purpose = 'login' AND consumed_at IS NOT NULL));
