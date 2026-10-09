-- Pre-production cleanup: limits belong only to main spending categories.
-- Remove every subcategory limit, including archived, disabled and deleted records,
-- plus dependent revisions/references. Categories, ledger activity and audit stay intact.
DELETE FROM budget_category_history
WHERE budget_id IN (
    SELECT b.id FROM spending_budgets b JOIN categories c ON c.id = b.category_id
    WHERE c.parent_id IS NOT NULL
);

DELETE FROM spending_budgets
WHERE category_id IN (SELECT id FROM categories WHERE parent_id IS NOT NULL);

DELETE FROM budget_setting_category_history
WHERE setting_id IN (
    SELECT s.id FROM budget_settings s JOIN categories c ON c.id = s.category_id
    WHERE c.parent_id IS NOT NULL
);

DELETE FROM budget_setting_revisions
WHERE setting_id IN (
    SELECT s.id FROM budget_settings s JOIN categories c ON c.id = s.category_id
    WHERE c.parent_id IS NOT NULL
);

DELETE FROM budget_settings
WHERE category_id IN (SELECT id FROM categories WHERE parent_id IS NOT NULL);
