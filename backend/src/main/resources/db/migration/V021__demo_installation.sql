-- Empty on normal installations. Only explicit demo startup may create this marker.
CREATE TABLE demo_installation (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    user_id UUID NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE RESTRICT,
    generation UUID NOT NULL,
    dataset_version INTEGER NOT NULL CHECK (dataset_version > 0),
    seeded_at TIMESTAMPTZ NOT NULL,
    mutation_requests INTEGER NOT NULL DEFAULT 0 CHECK (mutation_requests BETWEEN 0 AND 5000)
);
