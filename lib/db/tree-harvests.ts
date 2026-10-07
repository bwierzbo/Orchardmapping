import { sql } from '@vercel/postgres';
import { toPounds, type HarvestUnit } from '../harvest-units';

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
  notes?: string | null;
  createdBy?: string | null;
}

export interface TreeHarvestRow {
  id: number;
  harvest_date: string;
  quantity: string | null;
  unit: string | null;
  weight_lbs: string;
  notes: string | null;
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
      (orchard_id, tree_id, harvest_date, quantity, unit, weight_lbs, notes, created_by)
    VALUES (
      ${input.orchardId},
      ${input.treeId},
      ${input.harvestDate},
      ${input.quantity},
      ${input.unit},
      ${weightLbs},
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

/** This tree's harvests, newest first. */
export async function listTreeHarvests(treeId: string): Promise<TreeHarvestRow[]> {
  const { rows } = await sql<TreeHarvestRow>`
    SELECT id, harvest_date, quantity, unit, weight_lbs, notes
    FROM harvests
    WHERE tree_id = ${treeId} AND undone_at IS NULL
    ORDER BY harvest_date DESC, id DESC
  `;
  return rows;
}
