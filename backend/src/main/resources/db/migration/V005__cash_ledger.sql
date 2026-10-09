CREATE TABLE ledger_operations (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id),
 kind VARCHAR(20) NOT NULL CHECK (kind IN ('INCOME','EXPENSE','REFUND','TRANSFER')),
 account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
 destination_id UUID REFERENCES financial_accounts(id) ON DELETE RESTRICT,
 amount NUMERIC(28,8) NOT NULL CHECK (amount > 0), currency VARCHAR(3) NOT NULL,
 transaction_date DATE NOT NULL, value_date DATE, payee VARCHAR(200),
 description VARCHAR(500) NOT NULL, notes VARCHAR(2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, version BIGINT NOT NULL DEFAULT 0,
 deleted BOOLEAN NOT NULL DEFAULT FALSE,
 CHECK ((kind = 'TRANSFER') = (destination_id IS NOT NULL)), CHECK (account_id <> destination_id)
);
CREATE TABLE ledger_movements (
 id UUID PRIMARY KEY, operation_id UUID NOT NULL REFERENCES ledger_operations(id),
 account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
 amount NUMERIC(28,8) NOT NULL, currency VARCHAR(3) NOT NULL
);
CREATE TABLE ledger_account_history (
 operation_id UUID NOT NULL REFERENCES ledger_operations(id),
 account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
 PRIMARY KEY(operation_id, account_id)
);
CREATE INDEX ledger_movements_account ON ledger_movements(account_id);
CREATE INDEX ledger_history_account ON ledger_account_history(account_id);
CREATE INDEX ledger_operations_owner_date ON ledger_operations(owner_id, transaction_date DESC, created_at DESC, id);
