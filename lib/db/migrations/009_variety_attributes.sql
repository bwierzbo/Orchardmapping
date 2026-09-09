-- Migration: variety_attributes — catalog-level facts about a variety
-- (bloom group, ripening window, cider type, pollinator). These are
-- variety attributes, not tree attributes: every Kingston Black blooms
-- together, so this lives once per variety and feeds the bloom-overlap
-- chart and harvest calendar. Observed bloom events (tree_events) later
-- overlay the actual windows against these catalog expectations.

CREATE TABLE IF NOT EXISTS variety_attributes (
  variety VARCHAR(100) PRIMARY KEY,
  -- BSH bittersharp / SH sharp / BSW bittersweet / SW sweet
  cider_type VARCHAR(10),
  origin VARCHAR(100),
  -- 1 early … 5 late (within the ~3-week spring bloom span)
  bloom_group INTEGER CHECK (bloom_group BETWEEN 1 AND 5),
  -- Days relative to McIntosh (Sep 15 baseline at this site)
  ripen_offset_days INTEGER,
  ripen_hint VARCHAR(50),
  pollinator VARCHAR(100),
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
