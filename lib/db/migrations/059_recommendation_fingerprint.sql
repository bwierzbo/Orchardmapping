-- Notice when the advice changes, without overwriting what you chose.
--
-- An orchard adopts its region's recommendation and then owns the result.
-- But the recommendation can be revised later — a threshold corrected, a
-- window moved, a material swapped after a trial result. Today that
-- revision reaches nobody: adopted steps are copies, and copies do not
-- hear about corrections. The copper re-entry interval in this repo was
-- once wrong by half; an orchard that had adopted it would never have
-- learnt otherwise.
--
-- So each adopted step records a fingerprint of the recommendation it was
-- taken from. When the recommendation's fingerprint no longer matches,
-- the orchard is told there is something to review. It is never applied
-- automatically: the orchard's version may be deliberate, and silently
-- reverting somebody's decision is the one thing worse than not telling
-- them.

ALTER TABLE orchard_program_steps
  ADD COLUMN IF NOT EXISTS adopted_fingerprint TEXT;

COMMENT ON COLUMN orchard_program_steps.adopted_fingerprint IS
  'md5 of the recommended step as it stood when adopted. Differs from the current recommendation = there is a revision to review. Never applied automatically.';

-- Backfill from what the recommendation says now, which is what these
-- steps were in fact materialised from.
UPDATE orchard_program_steps ops
SET adopted_fingerprint = md5(
      COALESCE(s.title, '') || '|' || COALESCE(s.detail, '') || '|' ||
      COALESCE(s.material_key, '') || '|' || COALESCE(s.pest_key, '') || '|' ||
      s.trigger_spec::text || '|' || COALESCE(s.repeat_days::text, '')
    )
FROM program_steps s
WHERE s.key = ops.source_step_key
  AND ops.source_step_key IS NOT NULL
  AND ops.adopted_fingerprint IS NULL;
