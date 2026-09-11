import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Seed the Home Orchard's raised garden and berry beds as area
 * features, with starting shapes computed from tree coordinates:
 * - Raised garden: the empty position-6 slots of rows 2-3, extrapolated
 *   from each row's P4->P5 direction.
 * - Berry beds: two rectangles east of the espalier (Rx) line —
 *   placeholders to drag/reshape into place with the area editor.
 * Idempotent: skips any area name that already exists.
 */

import { sql } from '@vercel/postgres';
import { insertArea, listAreas } from '../lib/db/areas';
import type { LngLat } from '../lib/types';

type Pt = LngLat;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];

async function treeAt(row: string, pos: string): Promise<Pt | null> {
  const { rows } = await sql`
    SELECT lng::float AS lng, lat::float AS lat FROM trees
    WHERE orchard_id = 'washington' AND row_id = ${row} AND position = ${pos}
      AND lat IS NOT NULL
  `;
  return rows.length ? [rows[0].lng, rows[0].lat] : null;
}

async function main() {
  const existing = new Set((await listAreas('washington')).map((a) => a.name));

  // --- Raised garden: rows 2-3, positions ~6-7 ---
  const r2p4 = await treeAt('2', '4');
  const r2p5 = await treeAt('2', '5');
  const r3p4 = await treeAt('3', '4');
  const r3p5 = await treeAt('3', '5');
  if (r2p4 && r2p5 && r3p4 && r3p5 && !existing.has('Raised garden')) {
    const step2 = sub(r2p5, r2p4); // one position along row 2
    const step3 = sub(r3p5, r3p4);
    const across = sub(r3p5, r2p5); // row 2 -> row 3
    const a = add(add(r2p5, step2, 0.6), across, -0.35);
    const b = add(add(r2p5, step2, 2.1), across, -0.35);
    const c = add(add(r3p5, step3, 2.1), across, 0.35);
    const d = add(add(r3p5, step3, 0.6), across, 0.35);
    await insertArea({
      orchard_id: 'washington',
      name: 'Raised garden',
      kind: 'garden',
      polygon: { type: 'Polygon', coordinates: [[a, b, c, d, a]] },
      notes: 'Raised beds in the rows 2-3 gap (sheet "Garden" block).',
    });
    console.log('seeded: Raised garden');
  }

  // --- Berry beds: two strips east of the espalier line ---
  const rx = await sql`
    SELECT lng::float AS lng, lat::float AS lat FROM trees
    WHERE orchard_id = 'washington' AND row_id = 'Rx' AND lat IS NOT NULL
    ORDER BY NULLIF(substring(position from '^\d+'), '')::int
  `;
  if (rx.rows.length >= 2) {
    const first: Pt = [rx.rows[0].lng, rx.rows[0].lat];
    const last: Pt = [rx.rows[rx.rows.length - 1].lng, rx.rows[rx.rows.length - 1].lat];
    const along = sub(last, first);
    // Perpendicular pointing east (+lng)
    let perp: Pt = [-along[1], along[0]];
    if (perp[0] < 0) perp = [-perp[0], -perp[1]];
    const norm = Math.hypot(perp[0], perp[1]) || 1;
    const east = (k: number): Pt => [(perp[0] / norm) * k, (perp[1] / norm) * k];
    const W = 0.00006; // strip width ~5 m

    const strip = (offset: number): LngLat[][] => {
      const o1 = east(offset);
      const o2 = east(offset + W);
      const a = add(first, o1);
      const b = add(last, o1);
      const c = add(last, o2);
      const d = add(first, o2);
      return [[a, b, c, d, a]];
    };

    if (!existing.has('Berries 1 (bush fruit)')) {
      await insertArea({
        orchard_id: 'washington',
        name: 'Berries 1 (bush fruit)',
        kind: 'berries',
        polygon: { type: 'Polygon', coordinates: strip(0.00008) },
        notes:
          'Huckleberries, gooseberry, blueberries, currants — placeholder shape, drag into place with the area editor.',
      });
      console.log('seeded: Berries 1 (bush fruit)');
    }
    if (!existing.has('Berries 2 (canes)')) {
      await insertArea({
        orchard_id: 'washington',
        name: 'Berries 2 (canes)',
        kind: 'berries',
        polygon: { type: 'Polygon', coordinates: strip(0.00008 + W + 0.00004) },
        notes:
          'Raspberries and blackberries — placeholder shape, drag into place with the area editor.',
      });
      console.log('seeded: Berries 2 (canes)');
    }
  } else {
    console.log('espalier (Rx) has no coordinates; berry beds not seeded');
  }
}

main().then(() => process.exit(0));
