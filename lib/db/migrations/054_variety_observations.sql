-- Measured juice chemistry, kept apart from what a variety *is*.
--
-- variety_attributes.cider_type is the canonical class: Kingston Black is
-- a bittersharp, globally and historically, and that does not change
-- because it grew differently somewhere. Measurements live here instead,
-- and are never written back — the moment an observation edits the
-- reference, you lose the ability to say "this differs from the book",
-- which is the whole point of recording it.
--
-- So the system can say: "known as a bittersharp, presents here as a
-- sharp" — the reference and the evidence, both visible, neither
-- pretending to be the other.
--
-- The Long Ashton classification (Barker, Long Ashton Research Station,
-- 1903) is a measurement, not an opinion: tannin above or below 0.2%,
-- malic acid above or below 0.45%. Which is why this table holds numbers
-- and the class is computed from them rather than typed in.
--
-- tannin_method matters and is not optional in practice. Long Ashton's
-- 0.2% is a Löwenthal permanganate figure; modern labs report total
-- polyphenols by Folin-Ciocalteu as g/L gallic acid equivalents, where
-- the equivalent line is about 1.25 g/L. Comparing one against the
-- other's threshold misclassifies fruit, silently.

CREATE TABLE IF NOT EXISTS variety_observations (
  id            SERIAL PRIMARY KEY,
  variety       TEXT NOT NULL,

  -- Where the measurement is FROM. A trial station's published mean, a
  -- region, or one of our own sites — all evidence, of differing weight.
  scope_kind    TEXT NOT NULL CHECK (scope_kind IN ('trial', 'region', 'site')),
  scope_value   TEXT NOT NULL,

  -- Seasons covered. A single year and a fifteen-year mean are both
  -- legitimate and must not read the same.
  season_from   INTEGER,
  season_to     INTEGER,

  tannin_pct    NUMERIC(5, 3),
  tannin_method TEXT CHECK (tannin_method IN ('permanganate', 'folin_gae', 'unknown')),
  acid_pct      NUMERIC(5, 3),
  ph            NUMERIC(4, 2),
  sg            NUMERIC(6, 4),
  brix          NUMERIC(5, 2),

  source        TEXT,
  url           TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS variety_observations_variety_idx
  ON variety_observations (lower(variety));
CREATE INDEX IF NOT EXISTS variety_observations_scope_idx
  ON variety_observations (scope_kind, scope_value);

COMMENT ON TABLE variety_observations IS
  'Measured juice chemistry by scope. Never written back into variety_attributes: the canonical class stays canonical, and this says how the fruit actually presented.';
COMMENT ON COLUMN variety_observations.tannin_method IS
  'permanganate (Long Ashton, threshold 0.2%) or folin_gae (threshold about 1.25 g/L). Not interchangeable.';
