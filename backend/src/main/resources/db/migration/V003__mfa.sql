CREATE TABLE user_mfa (
    user_id UUID PRIMARY KEY REFERENCES app_users(id),
    encrypted_secret BYTEA,
    enabled_at TIMESTAMPTZ,
    last_totp_step BIGINT NOT NULL DEFAULT -1,
    active_generation UUID,
    security_version BIGINT NOT NULL DEFAULT 0,
    CHECK ((encrypted_secret IS NULL) = (enabled_at IS NULL)),
    CHECK ((enabled_at IS NULL) = (active_generation IS NULL))
);
INSERT INTO user_mfa(user_id) SELECT id FROM app_users;
CREATE TABLE mfa_pending (
    user_id UUID PRIMARY KEY REFERENCES user_mfa(user_id),
    operation VARCHAR(12) NOT NULL CHECK (operation IN ('ENROLL', 'REPLACE', 'RECOVERY')),
    session_binding VARCHAR(36) NOT NULL,
    generation UUID NOT NULL,
    base_version BIGINT NOT NULL,
    encrypted_secret BYTEA,
    verified_step BIGINT,
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE mfa_recovery_codes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES user_mfa(user_id),
    generation UUID NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    used_at TIMESTAMPTZ
);
CREATE INDEX mfa_recovery_codes_owner_generation_idx ON mfa_recovery_codes(user_id, generation);
CREATE TABLE auth_attempt_limits (
    attempt_key VARCHAR(64) PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL,
    locked_until TIMESTAMPTZ
);
