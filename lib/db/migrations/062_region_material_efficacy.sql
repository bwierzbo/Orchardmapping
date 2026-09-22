-- Where a material works, and where it does not.
--
-- spray_materials.targets is global, and wettable sulfur's omits apple
-- scab. That omission encodes a real finding — WSU's testing west of the
-- Cascades shows sulfur does not hold scab here — but it encodes it as
-- though it were chemistry. In Michigan and New York, wettable sulfur is
-- a standard scab material, and a grower there would find the app simply
-- refusing to offer it, with no explanation, for a job it does.
--
-- Efficacy against a pathogen is not always a constant: inoculum
-- pressure, rainfall and the length of the infection season change what a
-- protectant can hold. So the material lists what it treats, and a region
-- may record that it does not work there, with the finding behind it.
--
-- The global list is corrected to say what the material does, and the
-- rain shadow carries the exclusion that was standing in for it.

CREATE TABLE IF NOT EXISTS region_material_efficacy (
  region_key   TEXT NOT NULL REFERENCES regions(key) ON DELETE CASCADE,
  material_key TEXT NOT NULL,
  pest_key     TEXT NOT NULL,
  -- FALSE = does not work here. Recorded as a fact with a source, not as
  -- a silent absence from a list.
  effective    BOOLEAN NOT NULL,
  reason       TEXT,
  source       TEXT,
  url          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (region_key, material_key, pest_key)
);

COMMENT ON TABLE region_material_efficacy IS
  'Regional exceptions to what a material treats. No row = the material''s own target list applies.';

-- Wettable sulfur does treat apple scab. That is what the label and every
-- eastern guide say.
UPDATE spray_materials
SET targets = ARRAY['powdery_mildew', 'apple_scab'],
    updated_at = NOW()
WHERE material_key = 'wettable_sulfur';

-- And in the Olympic rain shadow it does not hold it, which is the thing
-- that was being expressed by leaving scab off the list entirely.
INSERT INTO region_material_efficacy (region_key, material_key, pest_key, effective, reason, source)
VALUES (
  'olympic-rainshadow', 'wettable_sulfur', 'apple_scab', FALSE,
  'Wettable sulfur does not control scab west of the Cascades — lime sulfur is the organic material that does the work here. This is a regional finding about pressure and rainfall, not a property of the chemical: sulfur is a standard scab material in the east.',
  'WSU testing west of the Cascade Range'
)
ON CONFLICT (region_key, material_key, pest_key) DO NOTHING;
