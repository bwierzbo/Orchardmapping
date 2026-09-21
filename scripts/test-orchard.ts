import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * The test orchard: a safe place to put fake data.
 *
 *   npx tsx scripts/test-orchard.ts reset     rebuild it from scratch
 *   npx tsx scripts/test-orchard.ts season    load a full 2026 season
 *   npx tsx scripts/test-orchard.ts walk      resolve it through the year
 *   npx tsx scripts/test-orchard.ts drop      remove it entirely
 *
 * It exists because the alternative is worse. Trying features against
 * the real orchard means fabricated spray records sitting beside real
 * ones — and a spray record is a legal document, so a fake one is not a
 * tidiness problem. This orchard is clearly named, isolated by
 * orchard_id like every other tenant, and safe to wipe.
 *
 * It sits at the real orchard's coordinates so the weather, the
 * degree-day models and the scab model all see genuine conditions. The
 * only fiction is what a grower did.
 *
 * Replaying a season through this harness is what found three defects
 * that unit tests did not: evidence dated after the as-of date being
 * counted as evidence, a disease watch that stopped watching after one
 * missed event, and a trap threshold still demanding a spray in
 * September off a catch in July.
 */

import { sql } from '@vercel/postgres';
import { fetchArchiveHours, fetchRecentHours, nowLocalIso } from '../lib/openmeteo';
import { insertHours } from '../lib/db/weather';
import { markStage } from '../lib/db/phenology';
import { addTrap, recordCount } from '../lib/db/traps';
import { completeStep } from '../lib/db/program';
import { insertApplication } from '../lib/db/spray';
import { insertObservation } from '../lib/db/pests';
import { setPosture } from '../lib/db/posture';
import { resolveSchedule } from '../lib/db/schedule';

export const TEST_ORCHARD_ID = 'test-orchard';
const LAT = 48.1133845;
const LNG = -123.253226;

async function drop() {
  // Everything else cascades from orchards.
  await sql`DELETE FROM orchards WHERE id = ${TEST_ORCHARD_ID}`;
  console.log('test orchard removed');
}

async function reset() {
  await drop();
  await sql`
    INSERT INTO orchards (id, name, location, center_lat, center_lng,
      bounds_min_lng, bounds_min_lat, bounds_max_lng, bounds_max_lat,
      default_zoom, min_zoom, max_zoom, spray_program_mode)
    VALUES (${TEST_ORCHARD_ID}, 'TEST ORCHARD — fake data, safe to wipe',
      'Test harness at the real coordinates',
      ${LAT}, ${LNG}, ${LNG - 0.004}, ${LAT - 0.002}, ${LNG + 0.004}, ${LAT + 0.002},
      17, 14, 20, 'organic_practices')`;
  await sql`
    INSERT INTO weather_sources (orchard_id, source, kind, label, priority, notes)
    VALUES (${TEST_ORCHARD_ID}, 'openmeteo', 'gridded', 'Open-Meteo (gridded)', 90,
      'Real weather at the real coordinates — only the grower actions are fiction.')
    ON CONFLICT (orchard_id, source) DO NOTHING`;

  // A small block on the same 16 x 17 ft spacing as the real orchard,
  // so walk mode, the tree layer and inspections have something to work
  // with. Four rows of eight rather than fifteen of thirty-two: enough
  // to exercise every path, small enough to read in a terminal.
  const VARIETIES = ['Kingston Black', 'Harrison', 'Dabinett', 'Brown Snout'];
  const IN_ROW = 4.84 / 111_320;            // ~15.9 ft, in degrees latitude
  const BETWEEN = 5.22 / (111_320 * Math.cos((LAT * Math.PI) / 180));
  for (let row = 1; row <= 4; row++) {
    for (let pos = 1; pos <= 8; pos++) {
      const lat = LAT - (pos - 1) * IN_ROW;
      const lng = LNG + (row - 1) * BETWEEN;
      await sql`
        INSERT INTO trees (tree_id, orchard_id, row_id, position, variety,
                           rootstock, status, planted_date, lat, lng)
        VALUES (
          ${`test-orchard-R${String(row).padStart(2, '0')}-P${String(pos).padStart(3, '0')}`},
          ${TEST_ORCHARD_ID}, ${String(row)}, ${String(pos)},
          ${VARIETIES[(row - 1) % VARIETIES.length]},
          ${row <= 2 ? 'G.890' : 'M.111'},
          ${pos === 3 && row === 2 ? 'stressed' : 'healthy'},
          '2021-04-01', ${lat}, ${lng}
        )
        ON CONFLICT (tree_id) DO NOTHING`;
    }
  }

  const TZ = 'America/Los_Angeles'; // the test harness sits at the real coordinates
  const now = nowLocalIso(TZ);
  const archive = await fetchArchiveHours(LAT, LNG, '2026-01-01', now.slice(0, 10), TZ);
  const written = await insertHours(TEST_ORCHARD_ID, archive);
  const recent = await fetchRecentHours(LAT, LNG, 10, now, TZ);
  const hours = written + (await insertHours(TEST_ORCHARD_ID, recent));
  const { rows: t } = await sql`
    SELECT COUNT(*)::int AS n FROM trees WHERE orchard_id = ${TEST_ORCHARD_ID}`;
  console.log(`created: ${t[0].n} trees, ${hours} weather hours`);
}

/** A plausible 2026, entered the way a grower actually would. */
async function season() {
  const id = TEST_ORCHARD_ID;
  for (const [stage, on] of [
    ['green_tip', '2026-03-14'], ['half_inch_green', '2026-03-28'],
    ['tight_cluster', '2026-04-09'], ['pink', '2026-04-21'],
    ['first_bloom', '2026-05-01'], ['full_bloom', '2026-05-05'],
    ['petal_fall', '2026-05-12'], ['fruit_set', '2026-05-28'],
  ] as const) {
    await markStage({ orchardId: id, stage, observedOn: on });
  }

  const lr = await addTrap({ orchardId: id, trapType: 'leafroller_pheromone',
    label: 'LR 1', locationNote: 'Row 8 middle', deployedOn: '2026-04-05' });
  const s1 = await addTrap({ orchardId: id, trapType: 'red_sphere',
    label: 'Sphere 1', locationNote: 'North end, row 1', deployedOn: '2026-06-20' });
  const s2 = await addTrap({ orchardId: id, trapType: 'red_sphere',
    label: 'Sphere 2', locationNote: 'By the wild hawthorn', deployedOn: '2026-06-20' });

  for (const [d, n] of [['2026-04-19', 0], ['2026-04-26', 0], ['2026-05-03', 4],
                        ['2026-05-10', 9], ['2026-05-17', 6]] as const) {
    await recordCount({ trapId: lr, countedOn: d, count: n });
  }
  // Perimeter sphere catches more than the interior one — the pattern
  // that would justify a perimeter-only kaolin programme.
  for (const [d, a, b] of [['2026-06-28', 0, 0], ['2026-07-05', 0, 1], ['2026-07-12', 1, 4],
                           ['2026-07-19', 2, 7], ['2026-07-26', 1, 5], ['2026-08-02', 0, 3],
                           ['2026-08-16', 0, 0], ['2026-08-30', 0, 0]] as const) {
    await recordCount({ trapId: s1, countedOn: d, count: a });
    await recordCount({ trapId: s2, countedOn: d, count: b });
  }

  const { rows: mats } = await sql`SELECT id, material_key, name FROM spray_materials`;
  const sprays: [string, string, string][] = [
    ['2026-03-30T09:00:00-07:00', 'copper', 'apple_scab'],
    ['2026-03-30T09:00:00-07:00', 'horticultural_oil', 'woolly_apple_aphid'],
    ['2026-04-14T07:00:00-07:00', 'lime_sulfur', 'apple_scab'],
    ['2026-04-16T08:00:00-07:00', 'bt_kurstaki', 'leafrollers'],
    ['2026-04-23T08:00:00-07:00', 'bt_kurstaki', 'leafrollers'],
    ['2026-04-28T07:00:00-07:00', 'lime_sulfur', 'apple_scab'],
    ['2026-05-20T08:00:00-07:00', 'wettable_sulfur', 'powdery_mildew'],
    ['2026-07-08T07:00:00-07:00', 'gf120_bait', 'apple_maggot'],
    ['2026-07-16T07:00:00-07:00', 'gf120_bait', 'apple_maggot'],
  ];
  for (const [at, key, target] of sprays) {
    const m = mats.find((x) => x.material_key === key)!;
    await insertApplication({
      orchardId: id, materialId: Number(m.id), materialName: String(m.name),
      materialKey: key, appliedAt: new Date(at), target,
      areaDescription: 'Whole block', applicator: 'Test', windMph: 3, airTempF: 55,
      notes: 'test orchard',
    } as never);
  }

  for (const [stepKey, on] of [
    ['leaf_litter_sanitation', '2025-11-20'], ['canker_scouting', '2026-02-10'],
    ['anthracnose_excision', '2026-01-22'], ['red_spheres_hang', '2026-06-20'],
    ['leafroller_traps_hang', '2026-04-05'],
  ] as const) {
    await completeStep({ orchardId: id, stepKey, completedOn: on });
  }

  await insertObservation({ orchardId: id, pestKey: 'apple_scab', severity: 'light',
    observedAt: '2026-05-25', notes: 'A few lesions on Kingston Black, row 3' });
  await insertObservation({ orchardId: id, pestKey: 'leafrollers', severity: 'moderate',
    observedAt: '2026-05-08', notes: 'Rolled leaves, maybe 1 shoot in 20' });

  await setPosture({ orchardId: id, pestKey: 'apple_scab', posture: 'react',
    minSeverity: 'moderate' });
  console.log('season loaded');
}

/** Resolve the programme at points through the year and print it. */
async function walk() {
  const dates = ['2026-03-20', '2026-04-15', '2026-05-06', '2026-05-25',
                 '2026-07-10', '2026-07-20', '2026-09-20'];
  for (const d of dates) {
    const s = await resolveSchedule(TEST_ORCHARD_ID, d);
    const by = (st: string) => s.filter((r) => r.status === st);
    console.log(
      `\n═══ ${d}  due ${by('due').length} · watching ${by('monitor').length} · ` +
      `done ${by('done').length} · waiting ${by('waiting').length}`
    );
    for (const r of [...by('due'), ...by('monitor')]) {
      console.log(`  ${r.status.padEnd(8)} ${r.step.key.padEnd(24)} ${r.why.slice(0, 72)}`);
    }
  }
}

async function main() {
  const cmd = process.argv[2] ?? 'walk';
  if (cmd === 'reset') await reset();
  else if (cmd === 'season') await season();
  else if (cmd === 'walk') await walk();
  else if (cmd === 'drop') await drop();
  else {
    console.log('usage: reset | season | walk | drop');
    process.exit(1);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
