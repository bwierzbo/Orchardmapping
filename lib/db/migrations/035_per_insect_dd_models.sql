-- Degree-day steps carry their own model, and leafrollers get a biofix.
--
-- Until now every degree-day step said model 'gdd50_jan1' because that
-- was the only one implemented. Codling moth is genuinely base 50°F /
-- cutoff 88°F from January 1 — the no-biofix variant, valid north of
-- 46°N — so those three steps only change shape, not behaviour.
--
-- The leafroller second generation is the reason this exists. WSU times
-- it at 420-450 DD after the first moth catch, on base 41°F with an
-- 85°F cutoff. Over a maritime spring the base alone is a difference of
-- weeks: a 60°F day is 10 DD to a codling moth and 19 to a leafroller.
-- The step previously admitted in its own detail text that it could not
-- compute that date and fell back to a trap threshold. It can now.
--
-- Note the honest consequence: a biofix step cannot be placed at all
-- until a pheromone trap actually catches something. That is correct —
-- the model has no start date before then — and the resolver says so
-- rather than guessing at one.

UPDATE program_steps
SET trigger_spec = jsonb_build_object(
      'type', 'degree_day',
      'dd', (trigger_spec->>'dd')::int,
      'base', 50, 'cutoff', 88, 'from', 'jan1',
      'windowDays', COALESCE((trigger_spec->>'windowDays')::int, 7)
    ),
    updated_at = NOW()
WHERE trigger_spec->>'type' = 'degree_day'
  AND trigger_spec->>'model' = 'gdd50_jan1';
--> statement-breakpoint

UPDATE program_steps
SET title = 'Second-generation leafrollers, 435 DD after first catch',
    detail = 'The summer generation, timed the way WSU times it: 420 to 450 degree-days after the first moth catch, on a base of 41°F — not the base-50 model that runs for codling moth. It cannot be placed until a pheromone trap catches something, because before that the model has no start date. Target small larvae again; the ones already webbed into a rolled leaf are past reaching.',
    trigger_spec = '{"type":"degree_day","dd":435,"base":41,"cutoff":85,"from":"biofix","biofixTrap":"leafroller_pheromone","windowDays":10}',
    updated_at = NOW()
WHERE key = 'leafroller_summer_gen';
