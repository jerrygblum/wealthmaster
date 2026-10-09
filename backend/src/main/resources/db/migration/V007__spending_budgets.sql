CREATE TABLE spending_budgets (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id),
 category_id UUID NOT NULL, currency VARCHAR(3) NOT NULL,
 period_type VARCHAR(5) NOT NULL CHECK(period_type IN ('MONTH','YEAR')),
 period_start DATE NOT NULL, amount NUMERIC(28,8) NOT NULL CHECK(amount >= 0),
 version BIGINT NOT NULL DEFAULT 0, deleted BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(category_id,owner_id) REFERENCES categories(id,owner_id) ON DELETE RESTRICT,
 CHECK(EXTRACT(DAY FROM period_start)=1 AND (period_type='MONTH' OR EXTRACT(MONTH FROM period_start)=1))
);
CREATE UNIQUE INDEX spending_budget_period ON spending_budgets(owner_id,category_id,currency,period_type,period_start) WHERE NOT deleted;
CREATE TABLE budget_category_history (
 budget_id UUID NOT NULL REFERENCES spending_budgets(id) ON DELETE RESTRICT,
 category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
 PRIMARY KEY(budget_id,category_id)
);
CREATE INDEX budget_category_history_category ON budget_category_history(category_id);
