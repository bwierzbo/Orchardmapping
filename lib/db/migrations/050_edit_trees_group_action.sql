-- A group action that sets different values on different trees.
--
-- The existing kinds each apply ONE thing to a whole filtered set: an
-- event, or one field set to one value. That is the wrong shape for
-- editing a selection in a grid, where every row may differ, and for
-- renumbering a row, where every tree gets its own position.
--
-- 'edit_trees' carries the per-tree diffs in the fan-out tree_events
-- rows, exactly as set_field already does -- so it inherits per-tree
-- history and conditional undo for free. The group row itself holds the
-- selection and a summary rather than a field/value pair.

ALTER TABLE group_actions DROP CONSTRAINT group_actions_action_kind_check;
ALTER TABLE group_actions ADD CONSTRAINT group_actions_action_kind_check
  CHECK (action_kind IN ('log_event', 'set_field', 'harvest', 'edit_trees'));

COMMENT ON COLUMN group_actions.scope IS
  'The selection this action applied to, verbatim, for display. A filter (rows, varieties, ...) or an explicit treeIds list when the selection was drawn on the map.';
