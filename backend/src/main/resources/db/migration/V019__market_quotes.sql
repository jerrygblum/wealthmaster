ALTER TABLE investment_securities ADD COLUMN market_symbol VARCHAR(64);
CREATE TABLE market_quotes (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES app_users(id),
 security_id UUID, symbol VARCHAR(64) NOT NULL,
 base_currency VARCHAR(3) NOT NULL, quote_currency VARCHAR(3) NOT NULL,
 price NUMERIC(38,12) NOT NULL CHECK(price>0), previous_close NUMERIC(38,12),
 quoted_at TIMESTAMPTZ NOT NULL, fetched_at TIMESTAMPTZ NOT NULL,
 source VARCHAR(32) NOT NULL, series JSONB NOT NULL DEFAULT '[]',
 FOREIGN KEY(security_id,owner_id) REFERENCES investment_securities(id,owner_id) ON DELETE RESTRICT,
 CHECK(previous_close IS NULL OR previous_close>0)
);
CREATE INDEX market_security_latest ON market_quotes(owner_id,security_id,quoted_at DESC,fetched_at DESC);
CREATE INDEX market_fx_latest ON market_quotes(owner_id,base_currency,quote_currency,quoted_at DESC,fetched_at DESC) WHERE security_id IS NULL;
