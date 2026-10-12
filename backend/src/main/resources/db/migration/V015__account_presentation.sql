ALTER TABLE financial_accounts
 ADD COLUMN display_order BIGINT NOT NULL DEFAULT 0 CHECK (display_order >= 0),
 ADD COLUMN accent VARCHAR(20) NOT NULL DEFAULT 'DEFAULT'
 CHECK (accent IN ('DEFAULT','BLUE','TEAL','PURPLE','AMBER','ROSE'));

-- Retain the previous newest-first order. New accounts start before existing ones.
WITH positions AS (
 SELECT id, row_number() OVER (PARTITION BY owner_id ORDER BY created_at DESC, id) AS position
 FROM financial_accounts
)
UPDATE financial_accounts a SET display_order=p.position FROM positions p WHERE a.id=p.id;
