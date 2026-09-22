-- One orchard's block stops being everyone's advice.
--
-- The crown inspection step is legitimate regional guidance — Phytophthora
-- crown rot is a real problem in the maritime Northwest, and inspecting
-- in the dormant season is the right answer. What is not regional is the
-- sentence attached to it:
--
--   "Those trees are in year 5 of the 3-to-8-year failure window"
--
-- "Those trees" is Finn Hall's EMLA 106 block. Every orchard in the
-- database was being told about a planting it does not have, on a
-- rootstock it may not grow, at an age that is not its own.
--
-- So the recommendation says what holds anywhere, and the susceptibility
-- of particular rootstocks is stated as the general fact it is. Finn
-- Hall's own copy keeps its block detail as that orchard's note — which
-- is exactly what orchard_program_steps was built for.
--
-- Every orchard that already adopted this step will be told the advice
-- changed, via the review flow added in migration 059. That is the
-- mechanism working, not a problem: the old text was wrong for four of
-- the five, and each grower decides for themselves.

UPDATE program_steps
SET detail = 'Cut the bark at and just below the soil line: dark slimy tissue with an orange-brown margin is Phytophthora. Recovery after visible decline is rare, so this is a check worth making while there is still time to replant. Trees on susceptible rootstocks — EMLA 106 among them — are most at risk, typically failing three to eight years after planting on a wet site.',
    updated_at = NOW()
WHERE key = 'crown_inspection';
