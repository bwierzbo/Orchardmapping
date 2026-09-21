-- Orchard membership: who may see and change an orchard, and in what role.
--
-- Until now the access model was "any signed-in user is a trusted
-- collaborator" -- there was no owner on an orchard and the id came
-- straight from the URL, so one invite handed over every orchard in the
-- database, spray records included. This makes an orchard a tenant.
--
-- Roles match CiderPilot's vocabulary so the two apps read the same:
--   admin    -- settings, invite, delete
--   operator -- record walks, sprays, harvests (the working role)
--   viewer   -- read only

CREATE TABLE IF NOT EXISTS orchard_members (
  orchard_id  VARCHAR(255) NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,                 -- Clerk user id
  role        TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  invited_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (orchard_id, user_id)
);

CREATE INDEX IF NOT EXISTS orchard_members_user_idx ON orchard_members (user_id);

-- Invitations are keyed by email because a Clerk user id does not exist
-- until the person accepts and signs in. The membership row is created
-- when they first arrive with a matching email.
CREATE TABLE IF NOT EXISTS orchard_invitations (
  id           SERIAL PRIMARY KEY,
  orchard_id   VARCHAR(255) NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,                -- stored lowercased
  role         TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  invited_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  accepted_by  TEXT,
  revoked_at   TIMESTAMPTZ
);

-- One live invitation per email per orchard. Accepted and revoked rows are
-- kept as a record and excluded from the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS orchard_invitations_pending_idx
  ON orchard_invitations (orchard_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS orchard_invitations_email_idx
  ON orchard_invitations (email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- The only user who has ever written to this database becomes admin of
-- everything already in it. Identified from created_by across 62 rows of
-- real field activity; there are no other Clerk ids in the data.
INSERT INTO orchard_members (orchard_id, user_id, role)
SELECT id, 'user_3IhUM0ZV3VqYsDxjHAemspnphCm', 'admin' FROM orchards
ON CONFLICT (orchard_id, user_id) DO NOTHING;

-- Dead table from before Clerk: one row, a bcrypt hash, and no code path
-- anywhere that reads it. Leaving a password column lying around is a
-- liability, not a backup.
DROP TABLE IF EXISTS users;
