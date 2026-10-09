CREATE TABLE user_preferences (
    owner_id UUID PRIMARY KEY REFERENCES app_users(id),
    default_currency VARCHAR(3) CHECK (default_currency ~ '^[A-Z]{3}$'),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);
