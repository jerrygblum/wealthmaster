CREATE TABLE categories (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id),
 name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
 type VARCHAR(20) NOT NULL CHECK (type IN ('INCOME','SPENDING')),
 parent_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version BIGINT NOT NULL DEFAULT 0,
 CHECK (id <> parent_id), UNIQUE(id, owner_id)
);
ALTER TABLE categories ADD CONSTRAINT category_parent_owner_fk
 FOREIGN KEY(parent_id,owner_id) REFERENCES categories(id,owner_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX categories_unique_name ON categories(owner_id,type,COALESCE(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
CREATE INDEX categories_parent ON categories(parent_id);
CREATE TABLE category_owner_state (
 owner_id UUID PRIMARY KEY REFERENCES app_users(id),
 starter_installed BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE ledger_operations ADD COLUMN category_id UUID;
ALTER TABLE ledger_operations ADD CONSTRAINT ledger_category_owner_fk
 FOREIGN KEY(category_id,owner_id) REFERENCES categories(id,owner_id) ON DELETE RESTRICT;
ALTER TABLE ledger_operations ADD CONSTRAINT transfer_no_category CHECK(kind <> 'TRANSFER' OR category_id IS NULL);
CREATE TABLE ledger_category_history (
 operation_id UUID NOT NULL REFERENCES ledger_operations(id) ON DELETE RESTRICT,
 category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
 PRIMARY KEY(operation_id,category_id)
);
CREATE INDEX ledger_category_history_category ON ledger_category_history(category_id);
