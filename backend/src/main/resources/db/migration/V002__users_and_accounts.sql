CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE financial_accounts (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES app_users(id),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('CHECKING', 'SAVINGS', 'CASH', 'CREDIT_CARD', 'INVESTMENT', 'OTHER')),
    institution VARCHAR(100),
    currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    opening_balance NUMERIC(28,8) NOT NULL,
    opening_date DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX financial_accounts_owner_idx ON financial_accounts(owner_id, created_at DESC);
CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES app_users(id),
    event_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_events_actor_idx ON audit_events(actor_id, occurred_at);
