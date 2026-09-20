-- Two corrections and one new control.
--
-- 1. The 14-day sulfur/oil interval belongs to WETTABLE sulfur.
--    WSU's Fruit and Leaf Injury guide lists the pairs separately:
--      "Oil plus wettable sulfur: Either of these products applied
--       within 14 days of one another may mark light colored cherries."
--      "Lime-sulfur with oil: Do not apply oil to foliage treated with
--       lime-sulfur."
--    The first is symmetric and about cherry finish. The second is
--    DIRECTIONAL — it is about oil going onto lime-sulfured foliage,
--    not about mixing the two.
--
-- 2. Lime sulfur tank-mixed with oil is a registered bloom thinner
--    (WSU Apple Chemical Thinning: 1-3% v/v lime sulfur with 1-1.5%
--    summer oil, up to three applications during bloom). The guide is
--    explicit that "oils tend to increase the penetration and efficacy
--    of lime sulfur" — the synergy the interval guards against is the
--    same one the thinner deliberately uses. So lime sulfur must stop
--    declaring a symmetric conflict with oil: it was warning about the
--    endorsed operation while staying silent on the risky sequence.
--
-- 3. conflicts_after expresses that sequence. WSU gives NO interval for
--    it, so conflict_after_days is this app's conservative default and
--    the warning text says so rather than implying a citation.

ALTER TABLE spray_materials
  ADD COLUMN IF NOT EXISTS conflicts_after TEXT[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE spray_materials
  ADD COLUMN IF NOT EXISTS conflict_after_days INTEGER;
--> statement-breakpoint

-- Lime sulfur + oil is a tank mix, not a conflict. The engine checks
-- conflicts_with in BOTH directions, so the pairing has to be cleared
-- from both rows or the bloom mix still warns.
UPDATE spray_materials
SET conflicts_with = array_remove(conflicts_with, 'horticultural_oil'),
    updated_at = NOW()
WHERE material_key = 'lime_sulfur';
--> statement-breakpoint
UPDATE spray_materials
SET conflicts_with = array_remove(conflicts_with, 'lime_sulfur'),
    updated_at = NOW()
WHERE material_key = 'horticultural_oil';
--> statement-breakpoint

-- But oil must not go onto foliage that already carries lime sulfur.
UPDATE spray_materials
SET conflicts_after = ARRAY['lime_sulfur'],
    conflict_after_days = 14,
    updated_at = NOW()
WHERE material_key = 'horticultural_oil';
--> statement-breakpoint

-- Which steps an orchard actually runs.
--
-- program_steps is global regional agronomy; whether a given orchard
-- wants a step is a local decision. A missing row means enabled, so the
-- table only ever holds deliberate opt-outs.
CREATE TABLE IF NOT EXISTS orchard_step_settings (
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL REFERENCES program_steps(key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (orchard_id, step_key)
);
--> statement-breakpoint

-- Owner's decision, 2026-09: no crop thinning this season. Also worth
-- noting for whenever it is revisited — WSU's bloom-thinning
-- registration names only dessert cultivars (Red Delicious, Gala, Fuji,
-- Honeycrisp, …). No cider variety is on that list, so the thinning
-- response of a bittersweet to it is not something that guidance covers.
INSERT INTO orchard_step_settings (orchard_id, step_key, enabled)
VALUES ('finn-hall', 'bloom_thinning_spray', FALSE)
ON CONFLICT (orchard_id, step_key) DO UPDATE SET enabled = FALSE;
