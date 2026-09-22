-- Which pests a region actually has.
--
-- pest_library.prevalence was global, and the migration that created it
-- said so plainly: "prevalence is REGIONAL, not universal: this library
-- is written for maritime Washington in the Olympic rain shadow, where
-- the ranking differs from eastern-Washington guidance (apple maggot
-- over codling moth, anthracnose over everything, fire blight absent)."
--
-- That comment is the bug. A grower in Michigan or New York inherits
-- "fire blight: absent — not a proven problem west of the Cascades",
-- and fire blight is a top-three disease in both. The library also gets
-- consulted for coverage gaps, and an 'absent' pest is never flagged as
-- one, so the app would stay quiet about the disease most likely to kill
-- their trees.
--
-- What a pest IS stays global: its biology, its symptoms, its lookalikes,
-- how to monitor it. Only how much of a problem it is here moves.

CREATE TABLE IF NOT EXISTS region_pests (
  region_key  TEXT NOT NULL REFERENCES regions(key) ON DELETE CASCADE,
  pest_key    TEXT NOT NULL,
  prevalence  TEXT NOT NULL
              CHECK (prevalence IN ('high', 'moderate', 'low', 'absent', 'beneficial')),
  note        TEXT,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (region_key, pest_key)
);

COMMENT ON TABLE region_pests IS
  'How much of a problem each pest is in a given region. What a pest IS stays in pest_library; only its standing here lives at the region.';

-- The existing rankings are maritime-Washington rankings, so they become
-- the rain shadow's, carried across verbatim rather than re-judged.
INSERT INTO region_pests (region_key, pest_key, prevalence, source)
SELECT 'olympic-rainshadow', key, prevalence,
       'Carried from pest_library, where it was recorded as maritime-Washington guidance (WSU-primary research pass, Sept 2026)'
FROM pest_library
WHERE prevalence IS NOT NULL
ON CONFLICT (region_key, pest_key) DO NOTHING;

-- Left in place, no longer the source of truth: dropping it now would
-- break reads in the same deploy that adds the replacement. The column
-- is ignored once lib/db/pests.ts reads the region, and can go in a
-- later migration once nothing looks at it.
COMMENT ON COLUMN pest_library.prevalence IS
  'DEPRECATED — regional, and moved to region_pests (migration 056). Kept only so an older deploy does not break mid-rollout.';
