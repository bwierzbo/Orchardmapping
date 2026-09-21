-- Reference bloom dates from the WSU Mount Vernon cider cultivar trial.
--
-- These are another site's dates, not this orchard's. Mount Vernon is
-- ~70 miles east, same marine climate, similar elevation, so it gives a
-- usable ordering and a rough calendar anchor -- nothing more. It is not
-- a prediction for Finn Hall and the UI must not present it as one.
--
-- Stored as MM-DD because it is a recurring annual reference, not a date.
-- The trial's full range across 77 cultivars is 04-19 to 05-29.

ALTER TABLE variety_attributes
  ADD COLUMN IF NOT EXISTS ref_bloom_mmdd TEXT
    CHECK (ref_bloom_mmdd ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

COMMENT ON COLUMN variety_attributes.ref_bloom_mmdd IS
  'Mean bloom date at WSU Mount Vernon (MM-DD). Reference ordering only, not a Finn Hall prediction.';

UPDATE variety_attributes SET ref_bloom_mmdd = v.d FROM (VALUES
  ('Virginia Hewes Crab',  '04-19'),
  ('Golden Russet',        '04-19'),
  ('Nehou',                '04-19'),
  ('Fake Puget Spice',     '04-25'),
  ('Tremlett''s Bitter',   '05-05'),
  ('Muscat de Bernay',     '05-08'),
  ('Kingston Black',       '05-12'),
  ('Michelin',             '05-12'),
  ('Yarlington Mill',      '05-13'),
  ('Harrison',             '05-16'),
  ('Harry Masters Jersey', '05-16'),
  ('Stoke Red',            '05-19'),
  ('Chisel Jersey',        '05-19'),
  ('Brown Snout',          '05-22')
) AS v(variety, d) WHERE variety_attributes.variety = v.variety;

INSERT INTO value_provenance
  (subject, value_text, confidence, source, quote, url, verified_on, note)
VALUES (
  'variety_attributes.ref_bloom_mmdd',
  '14 varieties, 04-19 to 05-22',
  'quoted',
  'WSU Mount Vernon cider cultivar trial (2002-2017), via variety research notes',
  'bloom 4/19 (Hewes Crab, Golden Russet, Nehou) through 5/22 (Brown Snout); collection range 4/19-5/29',
  'https://cider.wsu.edu/ciderweb/',
  CURRENT_DATE,
  'Mean trial bloom dates, not Finn Hall observations -- ordering and rough anchor only. Two values were nearly mis-read during extraction: "5/5 bloom density" and "bloom density (4.1/5)" are 5-point ratings, not dates; the real dates for those varieties (Fake Puget Spice 4/25, Harry Masters Jersey 5/16) came from separate sentences. 19 of 33 varieties have no trial date and stay null, falling back to bloom_group.'
)
ON CONFLICT (subject) DO UPDATE SET
  value_text = EXCLUDED.value_text, confidence = EXCLUDED.confidence,
  source = EXCLUDED.source, quote = EXCLUDED.quote, url = EXCLUDED.url,
  verified_on = EXCLUDED.verified_on, note = EXCLUDED.note, updated_at = NOW();
