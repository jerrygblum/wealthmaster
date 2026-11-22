ALTER TABLE investment_securities DROP CONSTRAINT investment_securities_type_check;
ALTER TABLE investment_securities ADD CONSTRAINT investment_securities_type_check CHECK(type IN ('STOCK','ETF','FUND'));
ALTER TABLE investment_securities ADD CONSTRAINT fund_isin_required CHECK(type<>'FUND' OR (isin IS NOT NULL AND isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'));
CREATE UNIQUE INDEX investment_fund_isin ON investment_securities(owner_id,isin) WHERE type='FUND';

ALTER TABLE market_quotes ALTER COLUMN quoted_at DROP NOT NULL;
ALTER TABLE market_quotes ADD COLUMN nav_date DATE;
ALTER TABLE market_quotes ADD COLUMN manual_reference VARCHAR(500);
ALTER TABLE market_quotes ADD COLUMN request_id UUID;
ALTER TABLE market_quotes ADD COLUMN input_hash VARCHAR(64);
ALTER TABLE market_quotes ADD CONSTRAINT quote_date_kind CHECK(
 (source='MANUAL_NAV' AND security_id IS NOT NULL AND nav_date IS NOT NULL AND quoted_at IS NULL
    AND request_id IS NOT NULL AND input_hash IS NOT NULL AND base_currency=quote_currency)
 OR (source<>'MANUAL_NAV' AND quoted_at IS NOT NULL AND nav_date IS NULL AND request_id IS NULL AND input_hash IS NULL));
CREATE UNIQUE INDEX manual_nav_request ON market_quotes(owner_id,security_id,request_id) WHERE request_id IS NOT NULL;
CREATE INDEX manual_nav_latest ON market_quotes(owner_id,security_id,nav_date DESC,fetched_at DESC) WHERE source='MANUAL_NAV';
