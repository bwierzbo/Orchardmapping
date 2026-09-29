-- The interval check was written thinking about apples.
--
-- variety_harvest_targets.days_from_bloom was constrained to 60..260 days,
-- which is right for a pome fruit and wrong for everything softer. A
-- raspberry runs about eight weeks from flower to fruit -- Tulameen comes
-- out at 59 days here, and was rejected by a rule that had never
-- considered it. Currants and gooseberries are quicker still.
--
-- Floor dropped to 30 days, which admits every soft fruit in these
-- orchards while still catching the thing the check exists for: an
-- interval so short it means the wrong bloom anchor, or so long it means a
-- misparsed date.
ALTER TABLE variety_harvest_targets DROP CONSTRAINT IF EXISTS variety_harvest_targets_days_from_bloom_check;
ALTER TABLE variety_harvest_targets
  ADD CONSTRAINT variety_harvest_targets_days_from_bloom_check
  CHECK (days_from_bloom BETWEEN 30 AND 260);
