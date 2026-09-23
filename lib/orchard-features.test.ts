import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * A page that belongs to a programme must check whether this orchard
 * runs it.
 *
 * Same reasoning as orchard-page.test.ts: the failure mode of per-page
 * checks is the page someone forgets, and here forgetting means handing
 * a grower spray advice for trees they never agreed to spray. So the
 * check is a test rather than a convention.
 *
 * The other half matters just as much — a link to a gated page from an
 * ungated one leaves a button that goes nowhere useful. The dashboard
 * nav is the only place those links live.
 */
const ROOT = path.join(__dirname, '..', 'app', 'orchard', '[id]');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf-8');

/** Pages whose whole reason to exist is one of the two programmes. */
const GATED_PAGES: Array<{ file: string[]; flag: string; work: string }> = [
  { file: ['program', 'page.tsx'], flag: 'ipmEnabled', work: 'resolveSchedule(' },
  { file: ['spray', 'page.tsx'], flag: 'ipmEnabled', work: 'listSprayTargets(' },
  { file: ['nutrition', 'page.tsx'], flag: 'nutritionEnabled', work: 'getOrchardIntent(' },
];

describe('programme pages', () => {
  it.each(GATED_PAGES.map((g) => [g.file.join('/'), g] as const))(
    '%s checks the orchard runs it',
    (_label, g) => {
      const src = read(...g.file);
      expect(src).toContain(`orchard.${g.flag}`);
      expect(src).toContain('FeatureOff');
    }
  );

  it.each(GATED_PAGES.map((g) => [g.file.join('/'), g] as const))(
    '%s refuses before doing the programme work, not after',
    (_label, g) => {
      const src = read(...g.file);
      // The early return has to come before the page's own queries.
      // Declining to run somebody's programme means not doing the work
      // either — anchored to the actual call rather than to the render,
      // because a gate that merely precedes the JSX still pays for
      // everything the page was about to fetch.
      const gate = src.indexOf(`!orchard.${g.flag}`);
      // The FIRST call, not the last: a gate that sits after one fetch
      // and before another has still done the work it was declining.
      const work = src.indexOf(g.work);
      expect(gate).toBeGreaterThan(-1);
      expect(work).toBeGreaterThan(-1);
      expect(gate).toBeLessThan(work);
    }
  );
});

describe('dashboard navigation', () => {
  const nav = read('dashboard', 'page.tsx');

  it.each([
    ['program', 'ipmEnabled'],
    ['spray', 'ipmEnabled'],
    ['nutrition', 'nutritionEnabled'],
  ])('hides the %s link unless the orchard runs it', (route, flag) => {
    const link = nav.indexOf(`/${route}\`}`);
    expect(link).toBeGreaterThan(-1);
    // The guard sits immediately above its link, not somewhere in the file.
    const before = nav.slice(Math.max(0, link - 200), link);
    expect(before).toContain(`orchard.${flag} &&`);
  });

  it.each([
    ['stats', 'the block census is just the trees you mapped'],
    ['pests', 'the pest library is reference, not a programme'],
    ['traps', 'counting catches is worth doing on its own'],
    ['members', 'who can see this orchard is never gated'],
  ])('leaves the %s link alone — %s', (route) => {
    const link = nav.indexOf(`/${route}\`}`);
    expect(link).toBeGreaterThan(-1);
    const before = nav.slice(Math.max(0, link - 200), link);
    expect(before).not.toMatch(/orchard\.(ipm|nutrition)Enabled &&/);
  });
});

describe('the map', () => {
  it('does not ask what is due for an orchard that runs no programme', () => {
    const src = readFileSync(path.join(ROOT, 'viewer', 'OrchardViewer.tsx'), 'utf-8');
    const fetchAt = src.indexOf('fetchScheduleSummary(orchard.id)');
    expect(fetchAt).toBeGreaterThan(-1);
    // Hiding the chip while still asking the server is work done to
    // throw away, on the load that matters most.
    expect(src.slice(Math.max(0, fetchAt - 120), fetchAt)).toContain('if (!orchard.ipmEnabled) return;');
  });

  it('still loads the pest library, which is for recording what you saw', () => {
    const src = readFileSync(path.join(ROOT, 'viewer', 'OrchardViewer.tsx'), 'utf-8');
    const fetchAt = src.indexOf('trpc.pest.list');
    expect(fetchAt).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, fetchAt - 300), fetchAt)).not.toContain('ipmEnabled');
  });
});

/**
 * Hiding a page is not a gate.
 *
 * Every button behind the program and nutrition pages calls a procedure
 * by name, and a signed-in operator can call it whether or not the page
 * ever rendered. Before these, an orchard whose owner had not taken on a
 * spray programme could still have steps written into it and its
 * schedule read — the switch only meant something in the browser.
 *
 * Parsed from the router source rather than from the built router: what
 * this is checking is that nobody adds a procedure to one of these
 * namespaces using the ungated base, and the source is where that
 * mistake is made.
 */
describe('programme procedures', () => {
  const src = readFileSync(path.join(__dirname, 'trpc', 'router.ts'), 'utf-8');

  /** The procedures declared inside one top-level `name: router({ ... })`. */
  function proceduresIn(namespace: string): Array<[string, string]> {
    const start = src.indexOf(`\n  ${namespace}: router({`);
    expect(start).toBeGreaterThan(-1);
    const after = src.slice(start + 5);
    const next = after.search(/\n {2}[a-zA-Z0-9_]+: router\(\{/);
    const body = next === -1 ? after : after.slice(0, next);
    return [...body.matchAll(/\n {4}([a-zA-Z0-9_]+): ([a-zA-Z0-9_]+)(?:Procedure|\()/g)].map(
      (m) => [m[1], m[2]]
    );
  }

  const NAMESPACES: Array<[string, RegExp]> = [
    ['spray', /^ipm/],
    ['program2', /^ipm/],
    ['program', /^ipm/],
    ['nutrition', /^nutrition/],
  ];

  it.each(NAMESPACES)('every %s procedure is feature-gated', (namespace, expected) => {
    const procedures = proceduresIn(namespace);
    expect(procedures.length).toBeGreaterThan(0);
    // Listed rather than asserted one at a time, so a failure names
    // every procedure that slipped through instead of just the first.
    const ungated = procedures
      .filter(([, base]) => !expected.test(base))
      .map(([name, base]) => `${namespace}.${name} → ${base}Procedure`);
    expect(ungated).toEqual([]);
  });

  it('gates the two pest procedures that are programme decisions', () => {
    // What a pest IS stays readable for everyone; what you are DOING
    // about it is a programme, and posture exists to stop the coverage
    // check flagging an oversight.
    for (const [name, base] of proceduresIn('pest')) {
      if (name === 'setPosture' || name === 'clearPosture') {
        expect(base).toMatch(/^ipm/);
      }
    }
  });

  it('leaves the rest of the pest library ungated', () => {
    const reference = proceduresIn('pest').filter(
      ([name]) => !name.toLowerCase().includes('posture')
    );
    expect(reference.length).toBeGreaterThan(0);
    for (const [, base] of reference) {
      expect(base).not.toMatch(/^ipm|^nutrition/);
    }
  });

  it('requires BOTH switches to file nutrient advice as a program step', () => {
    // The sharpest edge in the feature: nutrition on, IPM off would
    // otherwise write a step into a programme nobody is running.
    expect(src).toContain('acceptAdvice: nutritionIntoProgramProcedure');
    const init = readFileSync(path.join(__dirname, 'trpc', 'init.ts'), 'utf-8');
    const decl = init.slice(init.indexOf('nutritionIntoProgramProcedure ='));
    expect(decl).toContain('nutritionOperatorProcedure');
    expect(decl.slice(0, 200)).toContain("requireFeature('ipm')");
  });

  it('checks the feature after the orchard has been resolved, not from raw input', () => {
    const init = readFileSync(path.join(__dirname, 'trpc', 'init.ts'), 'utf-8');
    // Reading orchardId from the raw input again would miss the
    // delete-by-record-id case, where the orchard comes from the row.
    const body = init.slice(init.indexOf("function requireFeature("));
    expect(body.slice(0, 1600)).toContain('ctx as { orchardId?: string }');
    expect(body.slice(0, 1600)).not.toContain('getRawInput');
  });
});
