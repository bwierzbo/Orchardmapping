-- The scab watch names the material it would send you to reach for.
--
-- The step carried no material because it is monitoring rather than a
-- spray. But a reactive posture has to know WHAT would be applied in
-- order to know how long the window lasts — lime sulfur's kickback is
-- what makes reacting to an infection period legitimate at all, and
-- without it the watch could only report that something happened.
--
-- It remains a monitoring step: naming the material does not schedule a
-- spray, it tells the posture which clock to run.

UPDATE program_steps
SET material_key = 'lime_sulfur',
    detail = 'Not a scheduled spray — a standing watch. An infection needs a Mills wetness period, roughly 6 to 11 hours wet at 50 to 60°F. What the watch DOES when one occurs is set by this orchard''s posture for scab: protect ahead of a forecast event, or react inside lime sulfur''s post-infection window, which is the only material here with kickback.',
    updated_at = NOW()
WHERE key = 'scab_infection_watch';
