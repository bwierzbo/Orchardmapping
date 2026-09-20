-- Apple maggot: bait first, film as the fallback.
--
-- Kaolin and a spinosad bait do the same job by opposite means, and the
-- difference decides which belongs in a program that does not yet know
-- its own pressure:
--
--   Kaolin is a PHYSICAL FILM. It only works intact and only works if
--   it is already on the fruit when the flies arrive, so it has to be
--   committed to before the season tells you whether you need it — and
--   at 25-50 lb/ac every 7 to 14 days from first catch to harvest, that
--   is roughly 1,000 lb over this block.
--
--   GF-120 is a BAIT. The fly has to feed on a droplet, so it is applied
--   as spots rather than full coverage, at 10-20 oz/ac, and it can go on
--   days AFTER a sphere catches rather than months before. Agriculture
--   and Agri-Food Canada trials took apple maggot injury from 69% to 3%
--   over successive years.
--
-- The step was already trap-triggered, which is the right trigger and
-- the wrong material: firing kaolin on first catch starts a three-pass
-- film build while flies are already laying. A bait fits that trigger.
--
-- Kaolin stays in the library as the fallback — for a supply gap, or for
-- a block that turns out to have pressure high enough to want a physical
-- barrier as well.

INSERT INTO spray_materials
  (material_key, name, material_type, active_ingredient, omri_listed, restricted_use,
   rei_hours, phi_days, targets, conflicts_with, conflict_days, max_per_season, notes)
VALUES
  ('gf120_bait', 'GF-120 NF Naturalyte fruit fly bait', 'insecticide', 'spinosad 0.02%',
   TRUE, FALSE, 4, 7, ARRAY['apple_maggot'], ARRAY[]::text[], NULL, NULL,
   'A BAIT, not a cover spray: applied as coarse droplets or a band that the fly must feed on, 10-20 oz/ac. Far more selective than a full-cover spinosad and a fraction of the material of a kaolin film. Rotate against other spinosad use to protect it.')
ON CONFLICT (material_key) DO NOTHING;
--> statement-breakpoint

-- The step is about the response, not the product, so it is renamed.
-- Safe as a plain UPDATE: nothing references the old key (checked —
-- no completions, no per-orchard settings, no recorded applications).
UPDATE program_steps
SET key = 'maggot_bait_response',
    title = 'Bait for apple maggot once the spheres catch',
    detail = 'Start on the first catch, not before. GF-120 is a bait — the fly has to feed on a droplet — so it goes on as spots or a band rather than full coverage, and it can be a response rather than something committed to in advance. Reapply about every 7 days and after rain, since the droplets are what the fly finds. FALLBACK: if GF-120 is unavailable, or if trap counts turn out high enough to want a physical barrier too, kaolin at 25-50 lb/ac every 7 to 14 days does the same job as a film — budget roughly 1,000 lb for this block over a season.',
    material_key = 'gf120_bait',
    -- A bait is renewed weekly and after rain, not on the 10-day film
    -- cycle kaolin wanted.
    repeat_days = 7,
    updated_at = NOW()
WHERE key = 'maggot_kaolin';
