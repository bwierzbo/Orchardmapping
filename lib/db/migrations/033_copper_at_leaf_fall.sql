-- The autumn copper moves off the fruit and onto the leaf scars.
--
-- The step was seeded as "before the autumn rains", 15 Sep to 15 Oct,
-- taken from the prose IPM plan without checking it against what this
-- block actually grows. Six years of the orchard's own weather put the
-- autumn rain onset between 8 September and 18 October, mean about the
-- 19th — while the block is Kingston Black, Harrison, Dabinett, Brown
-- Snout, Yarlington Mill, Stoke Red and Chisel Jersey, which come off in
-- late October and November. The rains beat the fruit down by four to
-- eight weeks EVERY year, so that window always fired onto a full crop.
--
-- Copper is support here, not the program: WSU's own trial failed on
-- anthracnose (Garton 2019, 77% canker growth despite sprays) and
-- excision is the control. A support material is not worth contorting a
-- harvest around, and its pre-harvest interval varies by formulation.
--
-- At leaf fall it does a job the September timing could not: protecting
-- the leaf SCARS, which are the infection court for European canker.
-- That is the NIAB leaf-fall cadence the IPM plan already cites, and it
-- closes the one moderate coverage gap that had a material available and
-- no step using it.
--
-- The cost, stated plainly: about six weeks less bark protection at the
-- front of the wet season. The monthly canker walk that starts 1 October
-- is what will say whether that matters here.
--
-- NOTE for later: NIAB describes a CADENCE across leaf drop — sprays at
-- roughly 10%, 50% and 90% fall — but copper is capped at one
-- application per season in this library, so the rules engine will warn
-- on a second. Raising that cap is an agronomic decision, not a data fix.

UPDATE program_steps
SET key = 'copper_leaf_fall',
    title = 'Copper at leaf fall, onto the scars',
    detail = 'Goes on as the leaves come down, after harvest — every leaf scar is an open wound and they are the infection court for European canker. This also carries the anthracnose bark protection the old September timing provided, minus the first few weeks of the wet season; the monthly canker walk is what tells you whether that trade was worth it. Deliberately after the fruit is off: this block picks late, the rains start well before that, and copper''s pre-harvest interval varies by formulation.',
    category = 'disease',
    pest_key = 'european_canker',
    trigger_spec = '{"type":"phenology","stage":"leaf_fall","windowDays":21}',
    sort_order = 45,
    updated_at = NOW()
WHERE key = 'copper_prefall';
--> statement-breakpoint

-- Copper now lists the timing constraint that caused the conflict.
UPDATE spray_materials
SET notes = 'One application per season. Support for anthracnose — excision is the actual program (WSU''s own fungicide trial failed, 77% canker growth). Timed at leaf fall here so it lands after this block''s late cider varieties are picked; its pre-harvest interval varies by formulation, so check the label before ever applying with fruit on the tree.',
    updated_at = NOW()
WHERE material_key = 'copper';
