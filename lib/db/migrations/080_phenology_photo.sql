-- A stage recorded from a photo keeps the photo, and what the app
-- suggested it showed. The person always confirms or corrects the
-- suggestion before the mark is saved; keeping both is how we learn how
-- often the suggestion was right, and so whether it can be trusted more,
-- or needs a model trained on these orchards' own photos.
ALTER TABLE phenology_marks
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS suggested_stage TEXT;

COMMENT ON COLUMN phenology_marks.suggested_stage IS
  'The stage suggested from photo_url ("unsure" when none), before the person confirmed or corrected it. Null for a mark not made from a photo.';
