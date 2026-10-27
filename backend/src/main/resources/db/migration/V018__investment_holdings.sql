ALTER TABLE ledger_operations DROP CONSTRAINT ledger_operations_kind_check;
ALTER TABLE ledger_operations ADD CONSTRAINT ledger_operations_kind_check
 CHECK(kind IN ('INCOME','EXPENSE','REFUND','TRANSFER','INVESTMENT_BUY','INVESTMENT_SELL'));
ALTER TABLE ledger_operations ADD CONSTRAINT investment_no_category
 CHECK(kind NOT IN ('INVESTMENT_BUY','INVESTMENT_SELL') OR category_id IS NULL);

CREATE TABLE investment_securities (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id),
 name VARCHAR(100) NOT NULL, symbol VARCHAR(32) NOT NULL, exchange VARCHAR(64) NOT NULL,
 isin VARCHAR(12), type VARCHAR(8) NOT NULL CHECK(type IN ('STOCK','ETF')),
 currency VARCHAR(3) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,owner_id)
);
CREATE UNIQUE INDEX investment_security_listing ON investment_securities(owner_id,lower(symbol),lower(exchange),currency);

CREATE TABLE investment_activities (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id),
 account_id UUID NOT NULL, security_id UUID NOT NULL,
 kind VARCHAR(8) NOT NULL CHECK(kind IN ('OPENING','BUY','SELL')),
 quantity NUMERIC(28,12) NOT NULL CHECK(quantity>0),
 unit_price NUMERIC(28,12), gross NUMERIC(56,24),
 trade_date DATE NOT NULL, cash_date DATE, acquired_on DATE,
 settlement NUMERIC(28,8), acquisition_cost NUMERIC(28,8),
 cash_currency VARCHAR(3) NOT NULL, trade_currency VARCHAR(3) NOT NULL,
 aggregate_opening BOOLEAN NOT NULL DEFAULT FALSE,
 charges JSONB NOT NULL DEFAULT '[]', reference VARCHAR(200), notes VARCHAR(2000),
 cash_operation_id UUID UNIQUE,
 request_id UUID NOT NULL, input_hash VARCHAR(64) NOT NULL,
 version BIGINT NOT NULL DEFAULT 0, reversed BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,owner_id), UNIQUE(owner_id,request_id),
 FOREIGN KEY(account_id,owner_id) REFERENCES financial_accounts(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(security_id,owner_id) REFERENCES investment_securities(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(cash_operation_id,owner_id) REFERENCES ledger_operations(id,owner_id) ON DELETE RESTRICT,
 CHECK((kind='OPENING' AND settlement IS NULL AND cash_date IS NULL) OR
       (kind IN ('BUY','SELL') AND settlement>0 AND cash_date IS NOT NULL AND unit_price>0)),
 CHECK(acquisition_cost IS NULL OR acquisition_cost>=0),
 CHECK(acquired_on IS NULL OR acquired_on<=trade_date)
);
ALTER TABLE ledger_operations ADD COLUMN investment_activity_id UUID UNIQUE;
ALTER TABLE ledger_operations ADD CONSTRAINT investment_cash_link_required
 CHECK((kind IN ('INVESTMENT_BUY','INVESTMENT_SELL')) = (investment_activity_id IS NOT NULL));
ALTER TABLE ledger_operations ADD CONSTRAINT investment_cash_owner_fk
 FOREIGN KEY(investment_activity_id,owner_id) REFERENCES investment_activities(id,owner_id) ON DELETE RESTRICT;

CREATE TABLE investment_lots (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL, activity_id UUID NOT NULL UNIQUE,
 quantity NUMERIC(28,12) NOT NULL CHECK(quantity>0), cash_cost NUMERIC(28,8),
 UNIQUE(id,owner_id),
 FOREIGN KEY(activity_id,owner_id) REFERENCES investment_activities(id,owner_id) ON DELETE RESTRICT,
 CHECK(cash_cost IS NULL OR cash_cost>=0)
);
CREATE TABLE investment_sale_allocations (
 sale_id UUID NOT NULL, lot_id UUID NOT NULL, owner_id UUID NOT NULL,
 quantity NUMERIC(28,12) NOT NULL CHECK(quantity>0), cash_cost NUMERIC(28,8),
 PRIMARY KEY(sale_id,lot_id), CHECK(cash_cost IS NULL OR cash_cost>=0),
 FOREIGN KEY(sale_id,owner_id) REFERENCES investment_activities(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(lot_id,owner_id) REFERENCES investment_lots(id,owner_id) ON DELETE RESTRICT
);
CREATE INDEX investment_account_activity ON investment_activities(owner_id,account_id,trade_date,id);
CREATE INDEX investment_allocation_lot ON investment_sale_allocations(lot_id);
