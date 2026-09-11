-- Fruit category per tree (apple, pear, plum, persimmon, apricot, …)
-- so mixed orchards can filter and eventually run per-fruit health,
-- IPM, and harvest logic. Free text with suggested values in the UI;
-- existing trees default to apple (this orchard's dominant crop).
ALTER TABLE trees ADD COLUMN IF NOT EXISTS fruit_type TEXT;
UPDATE trees SET fruit_type = 'apple' WHERE fruit_type IS NULL;
