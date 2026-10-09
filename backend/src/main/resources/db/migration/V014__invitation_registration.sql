ALTER TABLE app_users ADD COLUMN role VARCHAR(8) NOT NULL DEFAULT 'MEMBER'
    CHECK (role IN ('OWNER', 'MEMBER'));
UPDATE app_users SET role='OWNER' WHERE id=(SELECT id FROM app_users ORDER BY created_at,id LIMIT 1);
CREATE UNIQUE INDEX app_users_single_owner_idx ON app_users(role) WHERE role='OWNER';
CREATE TABLE registration_settings (
    id SMALLINT PRIMARY KEY CHECK (id=1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    version BIGINT NOT NULL DEFAULT 0
);
INSERT INTO registration_settings(id) VALUES(1);
CREATE TABLE registration_invitations (
    id UUID PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    code_hash VARCHAR(64) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES app_users(id),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    used_by UUID REFERENCES app_users(id),
    version BIGINT NOT NULL DEFAULT 0,
    CHECK ((used_at IS NULL) = (used_by IS NULL)),
    CHECK (used_at IS NULL OR revoked_at IS NULL)
);
