ALTER TABLE financial_accounts ADD COLUMN version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0);
-- Audit resource IDs intentionally have no account FK: deletion must preserve history.
ALTER TABLE audit_events ADD COLUMN details JSONB;
