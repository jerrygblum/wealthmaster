CREATE TABLE import_owner_state (owner_id UUID PRIMARY KEY REFERENCES app_users(id));
CREATE TABLE import_batches (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id),
 source_hash VARCHAR(64) NOT NULL, source BYTEA, workbook JSONB,
 plan JSONB, receipt JSONB, approved_token VARCHAR(64),
 status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','COMMITTED','REVERSED')),
 version BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_id,source_hash), UNIQUE(id,owner_id)
);
CREATE TABLE import_operation_links (
 batch_id UUID NOT NULL, owner_id UUID NOT NULL, proposal_key VARCHAR(500) NOT NULL,
 operation_id UUID NOT NULL, operation_version BIGINT NOT NULL, created BOOLEAN NOT NULL,
 source_rows JSONB NOT NULL,
 PRIMARY KEY(batch_id,proposal_key), UNIQUE(batch_id,operation_id),
 FOREIGN KEY(batch_id,owner_id) REFERENCES import_batches(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(operation_id,owner_id) REFERENCES ledger_operations(id,owner_id) ON DELETE RESTRICT
);
CREATE INDEX import_batches_owner ON import_batches(owner_id,created_at DESC);
