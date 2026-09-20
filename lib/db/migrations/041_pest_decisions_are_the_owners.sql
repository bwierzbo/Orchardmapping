-- Which pests an orchard tracks is the owner's decision, not the code's.
--
-- Until now the list of deliberately-untreated pests lived in a TypeScript
-- constant, which meant changing your mind about a pest required a
-- developer. It also duplicated a mechanism that already existed:
-- orchard_pest_posture with posture 'off' is precisely "a recorded
-- decision not to treat this", per orchard, with a note saying why.
--
-- So the constant moves into the table it should always have been in,
-- and the coverage check reads the orchard's own decisions. The same
-- mechanism now covers three states that were previously tangled:
--   a posture set to anything  — being managed
--   a posture set to 'off'     — decided against, with a reason
--   no posture at all          — undecided, which is what the check
--                                should actually be flagging

-- Yellowjackets stay, and get a decision instead of a deletion.
--
-- Removing them was the wrong instinct, and the library's own
-- convention says so: fire blight, sooty blotch and the earwig are all
-- catalogued precisely BECAUSE they will not be treated — so that
-- something seen in the orchard can be identified and confidently
-- dismissed rather than worried about. Fire blight's entry says as much
-- in its own summary.
--
-- The only reason removal looked necessary was that an untreated pest
-- showed up as a coverage gap. That is exactly what this migration
-- fixes. With the decision recorded, the knowledge stays and the
-- nagging stops — and the entry carries something genuinely useful that
-- deleting would have thrown away: yellowjackets are a picking-crew
-- safety problem at the busiest week of the year, which is a different
-- thing from a tree pest and worth having written down.
INSERT INTO pest_library
  (key, name, scientific_name, category, prevalence, summary, symptoms, lookalikes,
   lifecycle, timing, monitoring, management, cider_note, refs, sort_order)
VALUES
('yellowjackets', 'Yellowjackets & wasps', 'Vespula spp.', 'insect', 'moderate',
 'A harvest-season problem specific to cider work rather than a tree pest.',
 'Wasps working ripe and damaged fruit, hollowing it out. Numbers build sharply in late summer.',
 'Honeybees do not damage sound fruit; wasps enlarge existing wounds.',
 'Colonies grow through summer and peak at harvest, when they switch to sugar.',
 'Late summer through harvest.',
 'You will notice them without trying. Track which blocks and bins are affected.',
 'Remove drops and damaged fruit promptly — they are the attractant. Bait traps away from the picking area. Avoid pressing wasp-worked fruit.',
 'Both a fruit-quality issue and a picking-crew safety issue at exactly the busiest time of year.',
 ARRAY['WSU Hortsense'], 15)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- The decisions that were hardcoded, now recorded per orchard with the
-- reason attached. Applied to every orchard that exists, since these
-- were written as regional facts rather than as one owner's choices.
INSERT INTO orchard_pest_posture (orchard_id, pest_key, posture, min_severity, note)
SELECT o.id, d.pest_key, 'off', 'moderate', d.note
FROM orchards o
CROSS JOIN (VALUES
  ('fire_blight',
   'Absent west of the Cascades — catalogued so it can be planned around, not for.'),
  ('sooty_blotch_flyspeck',
   'Purely cosmetic and irrelevant to fermented product.'),
  ('european_earwig',
   'Beneficial — a woolly apple aphid predator worth protecting, not controlling.'),
  ('mites',
   'Self-inflicted: flare-ups follow broad-spectrum sprays that removed the predators. Restraint is the control.'),
  ('bulls_eye_rot',
   'The storage phase of anthracnose — the autumn copper and excision programme is the control.'),
  ('blue_mold',
   'Handled at the press as fruit hygiene rather than in the orchard.'),
  ('tent_caterpillar',
   'Episodic. Bt is held in reserve for an outbreak year rather than scheduled.'),
  ('rosy_apple_aphid',
   'Owner, Sept 2026: not a problem in this block. Oil and soap both treat it, so a step can be added the season it becomes one — but the control window shuts soon after petal fall, so that call has to be made before bud break.'),
  ('yellowjackets',
   'Not an orchard IPM target: they arrive everywhere regardless, nothing in the library treats them, and the answer is trapping at the cider shed rather than anything sprayed on a tree. Catalogued so they can be identified and dismissed.'),
  ('apple_ermine_moth',
   'Not tracked. A Puget Sound speciality that Bt would cover on the same timing as leafrollers, so switching it on is a posture change rather than new work — do that if it shows up.')
) AS d(pest_key, note)
WHERE EXISTS (SELECT 1 FROM pest_library l WHERE l.key = d.pest_key)
ON CONFLICT (orchard_id, pest_key) DO NOTHING;
