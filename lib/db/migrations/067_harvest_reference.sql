-- Picking windows for the varieties the library had nothing on, and one
-- fact it had no way to record.
--
-- Seventy of the hundred and nineteen varieties planted across these
-- orchards had no harvest window at all, so they got no bar on the
-- calendar. Most are a single tree -- a plum, a quince, four blueberries,
-- three hazelnuts -- and between them they are most of the orchard's
-- variety, if not most of its fruit.
--
-- Two things follow from filling them in.
--
-- A fifth basis. These dates come from the pomological record for each
-- variety, read for THIS coastline rather than for the place the variety
-- comes from: an English cider apple picked late October at home comes off
-- here in late September. That is a weaker thing than a bloom and a
-- harvest measured up the road at Mount Vernon and a stronger thing than
-- the word "Late", so it sits between them.
ALTER TABLE variety_harvest_targets DROP CONSTRAINT IF EXISTS variety_harvest_targets_basis_check;
ALTER TABLE variety_harvest_targets
  ADD CONSTRAINT variety_harvest_targets_basis_check
  CHECK (basis IN ('observed', 'wsu_paired', 'reference', 'text_date', 'season_word'));

-- And a way to say the season runs out first.
--
-- Pink Lady wants around two hundred days and a great deal more heat than
-- the Olympic rain shadow gives; a pomegranate will flower here and may
-- set, but it will not colour or sweeten. A date for either would be a
-- lie of a particularly useless kind -- it would send somebody out to pick
-- fruit that is not coming. "It does not ripen here" is the honest answer
-- and the more actionable one.
ALTER TABLE variety_harvest_targets
  ADD COLUMN IF NOT EXISTS ripens_here BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN variety_harvest_targets.ripens_here IS
  'False where this climate does not give the variety enough season to finish. The predicted window is then what it would want, not what it will get.';
