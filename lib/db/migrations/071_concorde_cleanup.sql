-- Tidy after the Concorde rename.
--
-- Migration 070 renamed the library's "Concord pear" to Concorde. The seed
-- script then ran from a reference table that still said "Concord pear" and
-- put the old name back as a second row, so the library briefly held both.
-- The seeder only writes a harvest window into a row that has none -- it
-- must not stomp a curated entry -- so the surviving Concorde row also kept
-- the old "name uncertain" text.
--
-- Both are corrected here, by name rather than by id so this is portable.

DELETE FROM variety_attributes
WHERE site_id IS NULL AND btrim(variety) = 'Concord pear';

DELETE FROM variety_harvest_targets
WHERE btrim(variety) = 'Concord pear';

UPDATE variety_attributes
SET harvest_window =
      '10 Sep – 30 Sep. Conference x Doyenne du Comice, East Malling 1977. '
      || 'OSU lists it for western Oregon and Washington at September — England '
      || 'picks it in late October and the hot-interior PNW crop from late August, '
      || 'so neither applies here. Long and tapered like Conference rather than '
      || 'round like Comice.',
    fruit_type = 'pear'
WHERE site_id IS NULL
  AND btrim(variety) = 'Concorde'
  AND COALESCE(harvest_window, '') LIKE '%Name uncertain%';
