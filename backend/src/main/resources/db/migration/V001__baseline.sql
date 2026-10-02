-- Establish Flyway ownership of schema evolution.
-- Domain tables start in dedicated migrations as v0.1 is implemented.
CREATE TABLE app_schema_metadata (
    id SMALLINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT NOT NULL
);

INSERT INTO app_schema_metadata (id, note)
VALUES (1, 'Wealth Master schema initialized');
