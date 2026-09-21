-- A level that applies to every orchard, present and future.
--
-- Membership answers "may this person touch this orchard". It cannot
-- answer "who runs this whole system" -- the people who support a grower
-- they have never met, and who must be able to reach orchard number six
-- the day it is created without anyone inviting them to it.
--
-- Same three levels as membership, so there is one vocabulary:
--   admin    -- everything on every orchard; the only role that may grant
--               global levels
--   operator -- record work in any orchard (walks, sprays, harvests,
--               tree edits), but not change its settings or its people
--   viewer   -- read every orchard, change nothing
--
-- A person's level on a given orchard is the HIGHER of their global level
-- and their membership there. Per-orchard can raise someone, never lower
-- them: an orchard's owner must not be able to lock out the people who
-- support the system, which is the whole reason the tier exists.

CREATE TABLE IF NOT EXISTS global_members (
  user_id    TEXT PRIMARY KEY,               -- Clerk user id
  role       TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  granted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE global_members IS
  'System-wide access. Applies to every orchard including ones created later. Kept deliberately small.';

-- Bootstrap: without a global admin nobody can grant the first one.
-- Anyone who is currently an admin of EVERY orchard is already operating
-- at that level, so this states what is true rather than inventing it.
-- Derived, not hardcoded, so it does the right thing on any database.
INSERT INTO global_members (user_id, role)
SELECT m.user_id, 'admin'
FROM orchard_members m
WHERE m.role = 'admin'
GROUP BY m.user_id
HAVING count(*) = (SELECT count(*) FROM orchards)
   AND (SELECT count(*) FROM orchards) > 0
ON CONFLICT (user_id) DO NOTHING;
