-- The 90% RH wetness threshold was checked, and it holds.
--
-- It had been recorded as an assumption — the most load-bearing one in
-- the scab model, since relative humidity supplies about three quarters
-- of the wet hours it counts. It turns out to be the best-supported
-- choice available.
--
-- Sentelhas et al. compared RH thresholds against measured leaf wetness
-- across several continents: "The RH >= 90% model performed best,
-- presenting the highest general fraction of correct estimates (FC),
-- between 0.87 and 0.92, and the lowest false alarm ratio (FAR),
-- between 0.02 and 0.31." It also halves the disagreement between
-- paired sensors, which matters for a warning system nobody calibrates.
--
-- The known failure mode is UNDER-estimating wetness duration at
-- several of the study sites — the same direction as every other error
-- this project has found, and a reason not to raise the threshold.
--
-- Sensitivity, measured over six seasons of this orchard's own weather,
-- counting moderate-or-worse infection periods from green tip to petal
-- fall:
--
--   80%  7.7 per season   +3.3
--   85%  5.5              +1.2
--   87%  4.8              +0.5
--   90%  4.3               —
--   93%  2.2              -2.2
--   95%  1.8              -2.5
--   rain only 1.3         -3.0
--
-- The curve is far steeper above 90 than below it. Dropping to 87 adds
-- about 12%; rising to 93 removes half. So 90 sits on the gentle side
-- of a knee, where being slightly wrong is cheap — which is the right
-- side to be on when the number cannot be calibrated without a sensor.
--
-- Good enough, in other words, and now for a stated reason.

UPDATE value_provenance
SET confidence = 'quoted',
    source = 'Sentelhas et al., suitability of relative humidity as an estimator of leaf wetness duration',
    quote = 'The RH >= 90% model performed best, presenting the highest general fraction of correct estimates (FC), between 0.87 and 0.92, and the lowest false alarm ratio (FAR), between 0.02 and 0.31.',
    url = 'https://www.sciencedirect.com/science/article/abs/pii/S0168192307002614',
    verified_on = '2026-09-20',
    note = 'Sensitivity over six seasons here: 87% adds ~12% more infection periods, 85% adds ~28%, 93% removes about half. The curve is steeper above 90 than below, so 90 sits on the gentle side of a knee. Known bias is toward under-estimating wetness, which argues against raising it.',
    updated_at = NOW()
WHERE subject = 'lib/scab.ts WETNESS_DEFAULTS.rhPct';
--> statement-breakpoint

INSERT INTO value_provenance
  (subject, value_text, confidence, source, quote, url, verified_on, note)
VALUES
('lib/scab.ts wetness proxy, general', 'RH + rain in place of a measured sensor', 'derived',
 'Sentelhas et al. (RH threshold) applied to gridded weather',
 NULL, NULL, '2026-09-20',
 'The threshold is well supported; feeding it GRIDDED humidity is not. The station comparison that would test that is still unrun, and a leaf wetness sensor at the orchard would retire the proxy entirely.')
ON CONFLICT (subject) DO NOTHING;
