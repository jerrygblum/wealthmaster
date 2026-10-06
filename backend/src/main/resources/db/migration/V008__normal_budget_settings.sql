CREATE TABLE budget_settings (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id), category_id UUID NOT NULL,
 currency VARCHAR(3) NOT NULL, mode VARCHAR(5) NOT NULL CHECK (mode IN ('NONE','MONTH','YEAR')),
 amount NUMERIC(28,8), version BIGINT NOT NULL DEFAULT 0,
 FOREIGN KEY(category_id,owner_id) REFERENCES categories(id,owner_id) ON DELETE RESTRICT,
 UNIQUE(owner_id,category_id,currency),
 CHECK ((mode='NONE' AND amount IS NULL) OR (mode<>'NONE' AND amount>=0))
);
CREATE TABLE budget_setting_revisions (
 id UUID PRIMARY KEY, setting_id UUID NOT NULL REFERENCES budget_settings(id) ON DELETE RESTRICT,
 version BIGINT NOT NULL, period_type VARCHAR(5) NOT NULL CHECK(period_type IN ('MONTH','YEAR')),
 effective_from DATE NOT NULL, amount NUMERIC(28,8) CHECK(amount>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(EXTRACT(DAY FROM effective_from)=1 AND (period_type='MONTH' OR EXTRACT(MONTH FROM effective_from)=1)),
 UNIQUE(setting_id,version,period_type)
);
CREATE INDEX budget_setting_effective ON budget_setting_revisions(setting_id,period_type,effective_from DESC,version DESC);
CREATE TABLE budget_setting_category_history (
 setting_id UUID NOT NULL REFERENCES budget_settings(id) ON DELETE RESTRICT,
 category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
 PRIMARY KEY(setting_id,category_id)
);
CREATE INDEX budget_setting_category_reference ON budget_setting_category_history(category_id);
