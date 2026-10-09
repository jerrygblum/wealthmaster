ALTER TABLE financial_accounts ADD CONSTRAINT account_owner_unique UNIQUE(id, owner_id);
ALTER TABLE ledger_operations ADD CONSTRAINT operation_owner_unique UNIQUE(id, owner_id);
CREATE TABLE expectation_owner_state (owner_id UUID PRIMARY KEY REFERENCES app_users(id));
CREATE TABLE expected_transactions (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id),
 name VARCHAR(100) NOT NULL CHECK(length(btrim(name)) > 0),
 kind VARCHAR(20) NOT NULL CHECK(kind IN ('INCOME','EXPENSE','TRANSFER')),
 account_id UUID NOT NULL, destination_id UUID, category_id UUID,
 amount NUMERIC(28,8) NOT NULL CHECK(amount > 0), currency VARCHAR(3) NOT NULL,
 day_of_month INT NOT NULL CHECK(day_of_month BETWEEN 1 AND 31),
 first_month DATE NOT NULL CHECK(EXTRACT(DAY FROM first_month)=1),
 last_month DATE CHECK(EXTRACT(DAY FROM last_month)=1 AND last_month >= first_month),
 payee VARCHAR(200), notes VARCHAR(2000), deleted BOOLEAN NOT NULL DEFAULT FALSE,
 version BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,owner_id), CHECK(account_id <> destination_id),
 CHECK((kind='TRANSFER')=(destination_id IS NOT NULL)), CHECK(kind <> 'TRANSFER' OR category_id IS NULL),
 FOREIGN KEY(account_id,owner_id) REFERENCES financial_accounts(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(destination_id,owner_id) REFERENCES financial_accounts(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(category_id,owner_id) REFERENCES categories(id,owner_id) ON DELETE RESTRICT
);
CREATE INDEX expected_owner ON expected_transactions(owner_id);
CREATE TABLE expected_occurrences (
 expectation_id UUID NOT NULL, owner_id UUID NOT NULL,
 month DATE NOT NULL CHECK(EXTRACT(DAY FROM month)=1),
 operation_id UUID, skipped BOOLEAN NOT NULL DEFAULT FALSE, version BIGINT NOT NULL DEFAULT 1,
 PRIMARY KEY(expectation_id,month), CHECK(NOT skipped OR operation_id IS NULL),
 FOREIGN KEY(expectation_id,owner_id) REFERENCES expected_transactions(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(operation_id,owner_id) REFERENCES ledger_operations(id,owner_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX expected_unique_operation ON expected_occurrences(operation_id) WHERE operation_id IS NOT NULL;
CREATE TABLE expected_account_history (
 expectation_id UUID NOT NULL REFERENCES expected_transactions(id),
 account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
 PRIMARY KEY(expectation_id,account_id)
);
CREATE INDEX expected_account_reference ON expected_account_history(account_id);
CREATE TABLE expected_category_history (
 expectation_id UUID NOT NULL REFERENCES expected_transactions(id),
 category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
 PRIMARY KEY(expectation_id,category_id)
);
CREATE INDEX expected_category_reference ON expected_category_history(category_id);
