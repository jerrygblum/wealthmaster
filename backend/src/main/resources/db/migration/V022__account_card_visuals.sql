ALTER TABLE financial_accounts
 ADD COLUMN color VARCHAR(7) CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
 ADD COLUMN logo VARCHAR(20) NOT NULL DEFAULT 'TYPE'
   CHECK (logo IN ('TYPE','UBS','POSTFINANCE','RAIFFEISEN','ZKB','REVOLUT','CUSTOM')),
 ADD COLUMN logo_data TEXT,
 ADD CONSTRAINT account_logo_data_valid CHECK (
   (logo <> 'CUSTOM' AND logo_data IS NULL) OR
   (logo = 'CUSTOM' AND logo_data IS NOT NULL AND length(logo_data) <= 44000
     AND logo_data LIKE 'data:image/png;base64,%'));
