-- Wettable sulfur waits for petal fall.
--
-- The mildew step was anchored to green tip with a 75-day window, which
-- put it entirely inside the primary scab programme. Lime sulfur already
-- lists powdery_mildew among its targets, so every sulfur pass during
-- that window was covering something already covered — a spray that was
-- not needed, on a material that does NOT control scab here and so buys
-- nothing else while it is on.
--
-- Moving it to petal fall also unclutters the one interval that matters
-- in spring: sulfur and oil must stay 14 days apart in both directions,
-- and the oil goes on at half-inch green. With the mildew sulfur pushed
-- past bloom there is no longer anything to thread between them.
--
-- The published season calendar already described it this way; this is
-- the data catching up with the document rather than the reverse.

UPDATE program_steps
SET title = 'Wettable sulfur for mildew, after petal fall',
    detail = 'Not before. Lime sulfur already covers powdery mildew while the primary scab programme is running, so a sulfur pass inside that window is one you did not need — and wettable sulfur does not control scab west of the Cascades, so it buys nothing else while it is on. Mildew is the one disease a dry site actively favours; it does not need free water, which is why it carries on mattering after the wet spring is over.',
    trigger_spec = '{"type":"phenology","stage":"petal_fall","windowDays":60}',
    repeat_days = 14,
    sort_order = 135,
    updated_at = NOW()
WHERE key = 'mildew_sulfur';
