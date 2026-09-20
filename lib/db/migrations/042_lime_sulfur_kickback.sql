-- Lime sulfur's post-infection window, from the literature rather than
-- from a guess.
--
-- It was recorded as 48 hours, labelled in the migration as "a
-- conservative default" — which was honest about being invented but was
-- still invented. The published figure for liquid lime sulfur is
-- 60 to 70 hours of post-infection activity, counted from the BEGINNING
-- of an infection period, and lime sulfur is the only fungicide
-- registered for organic production with demonstrated curative activity
-- against scab.
--
-- Two things survive the correction unchanged, which is reassuring:
-- counting from the start of the wet period rather than its end was the
-- right convention, and wettable sulfur having no post-infection
-- activity at all is confirmed.
--
-- 60 is taken rather than 70: the low end of a published range beats
-- the high end when the cost of being wrong is a spray that arrived
-- after it could work. Some European work argues for acting far sooner
-- than either figure for full efficacy, so this is the outer bound of
-- usefulness rather than a target.

UPDATE spray_materials
SET post_infection_hours = 60,
    notes = regexp_replace(
      COALESCE(notes, ''),
      ' Has post-infection activity.*$',
      ' Has post-infection activity, unlike wettable sulfur: 60 to 70 hours from the START of an infection period, the only organic-registered fungicide with demonstrated curative activity against scab. 60 h is used here as the low end of that range.'
    ),
    updated_at = NOW()
WHERE material_key = 'lime_sulfur';
