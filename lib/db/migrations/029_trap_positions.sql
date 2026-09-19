-- Where each trap actually hangs.
--
-- Position is the whole point for a perimeter trap: apple maggot flies
-- IN from wild hosts, so a sphere on the hawthorn side of the block and
-- one in the middle are answering different questions, and a count
-- means little without knowing which trap produced it.
--
-- Same convention as trees: NUMERIC lng/lat in WGS84, nullable so a
-- trap can exist before it has been placed (and so 028's traps, which
-- had no way to record a position, stay valid).

ALTER TABLE traps ADD COLUMN IF NOT EXISTS lng NUMERIC(10, 7);
--> statement-breakpoint
ALTER TABLE traps ADD COLUMN IF NOT EXISTS lat NUMERIC(10, 7);
