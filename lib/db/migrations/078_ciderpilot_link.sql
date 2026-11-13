-- Send an orchard's harvests to the cidery that buys them.
--
-- OrchardMap records what came off the trees; CiderPilot buys it, weighs it
-- and presses it. Until now the two were joined by typing the same picks
-- into both. Each harvest row is now sent to CiderPilot as a "pick", keyed
-- by its own id, and waits there until the cidery receives it -- at the
-- press, or from its Orchard Deliveries screen.
--
-- Off by default and per orchard, for the same reason the spray programme
-- is (063): most orchards here belong to other people, and whether their
-- harvests go to a cidery is theirs to say. The cidery has to agree as
-- well: it refuses picks from an orchard it has not linked to a vendor.

ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS ciderpilot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ciderpilot_since   DATE;

COMMENT ON COLUMN orchards.ciderpilot_enabled IS
  'Send this orchard''s harvests to CiderPilot. Default FALSE; an admin of the orchard turns it on.';
COMMENT ON COLUMN orchards.ciderpilot_since IS
  'Only harvests dated on or after this are sent. Set to the day sending was first turned on, so seasons already bought by other means do not arrive at the cidery to be bought again.';

-- What the cidery last said about each harvest. Kept beside harvests rather
-- than on it: this is the state of a conversation with another system, not
-- a fact about the fruit.
--
--   sent       accepted there and waiting to be received; `sent` holds what
--              was accepted, to tell whether the harvest has changed since
--   withdrawn  undone here and taken back there
--   locked     received by the cidery into a purchase; nothing sent from
--              here changes it any more
CREATE TABLE IF NOT EXISTS ciderpilot_pick_sync (
  harvest_id INTEGER PRIMARY KEY REFERENCES harvests(id) ON DELETE CASCADE,
  orchard_id VARCHAR(50) NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('sent', 'withdrawn', 'locked')),
  sent       TEXT,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ciderpilot_pick_sync_orchard_idx
  ON ciderpilot_pick_sync (orchard_id, state);
