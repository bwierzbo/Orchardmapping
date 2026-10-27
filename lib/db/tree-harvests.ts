import { sql } from '@vercel/postgres';
import { toPounds, type HarvestUnit } from '../harvest-units';
import { asHarvestUnit, type TreePick } from '../tree-harvest-season';
import { toYMD } from '../dates';
import { toNum, toNumOrUndefined } from './decode';

/**
 * A harvest recorded at one tree.
 *
 * Migration 012 made a harvest a group action: a scope, one aggregate
 * weight, an event fanned out to every tree in it. Right for clearing a
 * block, useless for what happens on an inspection round -- standing at one
 * tree with a full bin, wanting to say what came off this tree. 072 made
 * group_action_id nullable and added tree_id so both can exist.
 */

export interface TreeHarvestInput {
  treeId: string;
  orchardId: string;
  harvestDate: string;
  quantity: number;
  unit: HarvestUnit;
  /** Decides the bushel weight; apples and pears fill one differently. */
  fruitType?: string | null;
  /** Which variety on the tree it was; null when the tree has none recorded. */
  variety?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

/**
 * Writes the harvest and returns the pounds it worked out to.
 *
 * The entered quantity and unit are stored beside the normalised weight
 * rather than instead of it: a grower who recorded 3 bushels should see 3
 * bushels, and anything adding harvests together still has one unit to add.
 */
export async function insertTreeHarvest(
  input: TreeHarvestInput,
): Promise<{ weightLbs: number }> {
  const weightLbs = toPounds(input.quantity, input.unit, input.fruitType);
  if (weightLbs === null) {
    throw new Error('A harvest needs a quantity greater than zero');
  }
  await sql`
    INSERT INTO harvests
      (orchard_id, tree_id, harvest_date, quantity, unit, weight_lbs, variety, notes, created_by)
    VALUES (
      ${input.orchardId},
      ${input.treeId},
      ${input.harvestDate},
      ${input.quantity},
      ${input.unit},
      ${weightLbs},
      ${input.variety ?? null},
      ${input.notes ?? null},
      ${input.createdBy ?? null}
    )
  `;
  // The panel and the picking model both read last_harvest, so a harvest
  // that did not move it would leave the tree looking unpicked. Only ever
  // forward: back-filling an older pick must not rewind a later one.
  await sql`
    UPDATE trees
    SET last_harvest = ${input.harvestDate}
    WHERE tree_id = ${input.treeId}
      AND (last_harvest IS NULL OR last_harvest < ${input.harvestDate})
  `;
  return { weightLbs };
}

/**
 * This tree's harvests, newest first, decoded for the client: the date as
 * YYYY-MM-DD and the DECIMAL columns, which the driver hands back as
 * strings, as numbers.
 */
export async function listTreeHarvests(treeId: string): Promise<TreePick[]> {
  const { rows } = await sql`
    SELECT id, harvest_date, quantity, unit, weight_lbs, variety
    FROM harvests
    WHERE tree_id = ${treeId} AND undone_at IS NULL
    ORDER BY harvest_date DESC, id DESC
  `;
  return rows.map((r) => {
    const quantity = toNumOrUndefined(r.quantity);
    return {
      id: Number(r.id),
      harvest_date: toYMD(r.harvest_date) ?? '',
      quantity: quantity ?? null,
      unit: asHarvestUnit(r.unit),
      weight_lbs: toNum(r.weight_lbs, 0),
      variety: r.variety == null ? null : String(r.variety),
    };
  });
}

/**
 * Mark a tree finished for the season, or open it again (null).
 *
 * Its own write rather than a column in TREE_UPDATABLE_COLUMNS: the edit
 * form must not be able to set it in passing, and every change to it writes
 * a history row of its own, which a generic update would not.
 */
export async function setTreeHarvestCompletedOn(
  treeId: string,
  completedOn: string | null,
): Promise<void> {
  // The tree's own variety goes with it: on a one-variety tree the two are
  // the same thing, and a graft added later must find it already closed.
  await sql`
    UPDATE trees
    SET harvest_completed_on = ${completedOn},
        main_harvest_completed_on = ${completedOn},
        updated_at = NOW()
    WHERE tree_id = ${treeId}
  `;
}

