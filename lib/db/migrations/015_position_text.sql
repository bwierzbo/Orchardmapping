-- Positions become free-form alphanumeric labels ("5", "1N", "2S",
-- "A3") so blocks like "Espalier" or "North side" can address trees
-- without pretending to be numbered rows. Existing integer positions
-- read back identically as text; the (orchard_id, row_id, position)
-- unique constraint survives the type change.
ALTER TABLE trees ALTER COLUMN position TYPE TEXT USING position::text;
