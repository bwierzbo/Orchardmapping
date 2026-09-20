-- Leafrollers, which should have been here from the start.
--
-- The pest library has rated them 'high' since migration 021 —
-- "consistently present west-side" — and Bt kurstaki has listed them as
-- a target since 019. The program seeded in 026 came from the prose IPM
-- plan, whose insect section covers apple maggot and codling moth only,
-- and nothing cross-checked the steps against the library. So the one
-- material that treats the orchard's worst insect sat unscheduled.
--
-- Timing is WSU-primary (treefruit.wsu.edu, Leafrollers):
--   * Overwintering larvae leave their hibernacula by half-inch green,
--     so the delayed-dormant window is already closing when growth
--     starts.
--   * Bt gives good control with "2 or 3 applications ... from tight
--     cluster through petal fall", re-treating at 7-day intervals
--     because its residual is short.
--   * Bt is a stomach poison: coverage matters more than rate, and it
--     wants a warm spell (above about 65°F for three days) to work.
--   * There is a second generation, hatching mid-to-late June.

INSERT INTO program_steps
  (key, title, detail, category, pest_key, material_key, trigger_spec, repeat_days, sort_order)
VALUES

('leafroller_bt_spring',
 'Bt through the leafroller window',
 'Two or three passes from tight cluster through petal fall, about a week apart — Bt has a short residual, so one application is not a program. Target SMALL larvae: once they are large and webbed inside a rolled leaf, sprays reach them poorly. Bt is a stomach poison, so coverage beats rate, and it works best going on ahead of a warm spell. This same window is the one that covers apple ermine moth.',
 'insect', 'leafrollers', 'bt_kurstaki',
 '{"type":"phenology","stage":"tight_cluster","untilStage":"petal_fall"}', 7, 95),

('leafroller_traps_hang',
 'Hang the leafroller pheromone traps',
 'Species-specific lures, out before the spring flight. They tell a leafroller problem from an ermine moth one before you spray for the wrong thing, and the first moth catch is what dates the summer generation.',
 'monitoring', 'leafrollers', NULL,
 '{"type":"calendar","start":"04-01","end":"04-30"}', NULL, 96),

('leafroller_summer_gen',
 'Second-generation leafrollers, on trap evidence',
 'The summer generation hatches mid-to-late June. WSU times it at 420 to 450 degree-days after the first moth catch — on a base of 41°F, NOT the base-50 model this app runs for codling moth, so it cannot yet compute that date for you. Treated here as a trap-driven step instead: once the pheromone traps are catching, scout for young larvae and treat before they damage fruit.',
 'insect', 'leafrollers', 'bt_kurstaki',
 '{"type":"threshold","trap":"leafroller_pheromone","count":5}', 7, 97)

ON CONFLICT (key) DO NOTHING;
