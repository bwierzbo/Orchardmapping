import { describe, it, expect } from 'vitest';
import {
  evaluateApplication,
  availableMaterials,
  recommendFor,
  hasBlocker,
  type SprayMaterial,
} from './spray-rules';

function material(over: Partial<SprayMaterial> = {}): SprayMaterial {
  return {
    id: 1,
    material_key: 'lime_sulfur',
    name: 'Lime sulfur',
    material_type: 'fungicide',
    active_ingredient: 'calcium polysulfide',
    omri_listed: true,
    restricted_use: false,
    rei_hours: 48,
    phi_days: null,
    rate_low: null,
    rate_high: null,
    rate_unit: null,
    targets: ['apple_scab'],
    // Lime sulfur has NO symmetric oil conflict: mixed with oil it is a
    // registered bloom thinner. The hazard is one-way, and lives on oil.
    conflicts_with: [],
    conflict_days: null,
    conflicts_after: [],
    conflict_after_days: null,
    max_per_season: null,
    notes: null,
    ...over,
  };
}

const OIL = material({
  id: 2,
  material_key: 'horticultural_oil',
  name: 'Horticultural oil',
  material_type: 'insecticide',
  targets: ['aphids', 'codling_moth'],
  conflicts_with: ['wettable_sulfur'],
  conflict_days: 14,
  // "Do not apply oil to foliage treated with lime-sulfur" — one-way
  conflicts_after: ['lime_sulfur'],
  conflict_after_days: 14,
  rei_hours: 12,
});

const WETTABLE = material({
  id: 5,
  material_key: 'wettable_sulfur',
  name: 'Wettable sulfur',
  targets: ['powdery_mildew'],
  conflicts_with: ['horticultural_oil'],
  conflict_days: 14,
});

const COPPER = material({
  id: 3,
  material_key: 'copper',
  name: 'Basic copper sulfate',
  targets: ['apple_anthracnose', 'apple_scab'],
  conflicts_with: [],
  conflict_days: null,
  max_per_season: 1,
});

const CONVENTIONAL = material({
  id: 4,
  material_key: 'malathion',
  name: 'Malathion',
  material_type: 'insecticide',
  omri_listed: false,
  targets: ['apple_maggot'],
  conflicts_with: [],
  conflict_days: null,
  rei_hours: 12,
  phi_days: 3,
});

const LIBRARY = [material(), OIL, COPPER, CONVENTIONAL, WETTABLE];
const MAY = new Date('2026-05-01T10:00:00Z');

describe('program mode', () => {
  it('blocks non-OMRI material for a certified orchard', () => {
    const f = evaluateApplication({
      material: CONVENTIONAL,
      appliedAt: MAY,
      mode: 'certified_organic',
      history: [],
      library: LIBRARY,
    });
    expect(hasBlocker(f)).toBe(true);
    expect(f.find((x) => x.level === 'blocked')!.message).toContain('OMRI');
  });

  it('warns but allows the same material under organic practices', () => {
    const f = evaluateApplication({
      material: CONVENTIONAL,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: [],
      library: LIBRARY,
    });
    expect(hasBlocker(f)).toBe(false);
    expect(f.some((x) => x.level === 'warning')).toBe(true);
  });

  it('says nothing about scope when unrestricted', () => {
    const f = evaluateApplication({
      material: CONVENTIONAL,
      appliedAt: MAY,
      mode: 'unrestricted',
      history: [],
      library: LIBRARY,
    });
    expect(f.some((x) => x.message.includes('OMRI'))).toBe(false);
  });
});

describe('wettable sulfur ↔ oil interval (symmetric)', () => {
  // WSU: "Oil plus wettable sulfur: Either of these products applied
  // within 14 days of one another may mark light colored cherries."
  const oilEightDaysBefore = [
    { material_key: 'horticultural_oil', material_name: 'Horticultural oil', applied_at: '2026-04-23T10:00:00Z', applied_on: '2026-04-23' },
  ];

  it('flags wettable sulfur applied too soon after oil', () => {
    const f = evaluateApplication({
      material: WETTABLE,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: oilEightDaysBefore,
      library: LIBRARY,
    });
    expect(f.some((x) => x.level === 'warning' && /14 days/.test(x.message))).toBe(true);
  });

  it('flags the reverse order too — oil soon after wettable sulfur', () => {
    const f = evaluateApplication({
      material: OIL,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: [
        { material_key: 'wettable_sulfur', material_name: 'Wettable sulfur', applied_at: '2026-04-25T10:00:00Z', applied_on: '2026-04-25' },
      ],
      library: LIBRARY,
    });
    expect(f.some((x) => x.level === 'warning' && /14 days/.test(x.message))).toBe(true);
  });

  it('says it once when both materials name each other', () => {
    const f = evaluateApplication({
      material: WETTABLE,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: oilEightDaysBefore,
      library: LIBRARY,
    });
    expect(f.filter((x) => /14 days/.test(x.message))).toHaveLength(1);
  });

  it('is quiet once the interval has passed', () => {
    const f = evaluateApplication({
      material: WETTABLE,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: [
        { material_key: 'horticultural_oil', material_name: 'Horticultural oil', applied_at: '2026-04-01T10:00:00Z', applied_on: '2026-04-01' },
      ],
      library: LIBRARY,
    });
    expect(f.some((x) => /14 days/.test(x.message))).toBe(false);
  });
});

describe('lime sulfur ↔ oil (directional, not symmetric)', () => {
  const limeSulfurYesterday = [
    { material_key: 'lime_sulfur', material_name: 'Lime sulfur', applied_at: '2026-04-30T10:00:00Z', applied_on: '2026-04-30' },
  ];
  const oilYesterday = [
    { material_key: 'horticultural_oil', material_name: 'Horticultural oil', applied_at: '2026-04-30T10:00:00Z', applied_on: '2026-04-30' },
  ];

  it('warns about OIL onto foliage that already carries lime sulfur', () => {
    const f = evaluateApplication({
      material: OIL,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: limeSulfurYesterday,
      library: LIBRARY,
    });
    const warn = f.find((x) => x.level === 'warning' && /foliage still carrying/.test(x.message));
    expect(warn).toBeDefined();
  });

  it('does not imply a citation it does not have', () => {
    // WSU publishes no interval for this pair, so the message has to own
    // the number as the app's own conservative default.
    const f = evaluateApplication({
      material: OIL,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: limeSulfurYesterday,
      library: LIBRARY,
    });
    const warn = f.find((x) => /foliage still carrying/.test(x.message))!;
    expect(warn.message).toMatch(/no interval is published/i);
    expect(warn.message).toMatch(/conservative default/i);
  });

  it('says NOTHING about lime sulfur applied after oil — that is the other way round', () => {
    const f = evaluateApplication({
      material: material(),
      appliedAt: MAY,
      mode: 'organic_practices',
      history: oilYesterday,
      library: LIBRARY,
    });
    expect(f.some((x) => x.level === 'warning' && /foliage|14 days/.test(x.message))).toBe(false);
  });

  it('leaves a same-day bloom tank mix alone', () => {
    // 1-3% lime sulfur with 1-1.5% summer oil is WSU's registered bloom
    // thinner, up to three applications. Warning on it would be wrong.
    const sameDay = [
      { material_key: 'lime_sulfur', material_name: 'Lime sulfur', applied_at: '2026-05-01T10:00:00Z', applied_on: '2026-05-01' },
    ];
    const f = evaluateApplication({
      material: OIL,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: sameDay,
      library: LIBRARY,
    });
    expect(f.some((x) => x.level === 'warning' && /foliage/.test(x.message))).toBe(false);
  });

  it('is quiet once the default interval has passed', () => {
    const f = evaluateApplication({
      material: OIL,
      appliedAt: MAY,
      mode: 'organic_practices',
      history: [
        { material_key: 'lime_sulfur', material_name: 'Lime sulfur', applied_at: '2026-04-10T10:00:00Z', applied_on: '2026-04-10' },
      ],
      library: LIBRARY,
    });
    expect(f.some((x) => /foliage/.test(x.message))).toBe(false);
  });
});

describe('per-season caps', () => {
  it('warns on a second dormant copper in the same season', () => {
    const f = evaluateApplication({
      material: COPPER,
      appliedAt: new Date('2026-11-15T10:00:00Z'),
      mode: 'organic_practices',
      history: [
        { material_key: 'copper', material_name: 'Basic copper sulfate', applied_at: '2026-03-01T10:00:00Z', applied_on: '2026-03-01' },
      ],
      library: LIBRARY,
    });
    expect(f.some((x) => /per season/.test(x.message))).toBe(true);
  });

  it("says whose limit it is when the orchard set it itself", () => {
    // A cap one orchard chose for harvest reasons must not read like
    // published guidance to anybody, including that orchard six months on.
    const f = evaluateApplication({
      material: material({
        ...COPPER,
        max_per_season: 1,
        orchard_limit_note: 'One copper a season rather than the recommended two, for harvest reasons.',
      }),
      appliedAt: new Date('2026-11-15T10:00:00Z'),
      mode: 'organic_practices',
      history: [
        { material_key: 'copper', material_name: 'Basic copper sulfate', applied_at: '2026-03-01T10:00:00Z', applied_on: '2026-03-01' },
      ],
      library: LIBRARY,
    });
    const warning = f.find((x) => /per season/.test(x.message))!;
    expect(warning.message).toContain("your orchard's own limit");
    expect(warning.message).toContain('harvest reasons');
  });

  it('does not claim a limit is the orchard\'s when it is the recommendation', () => {
    const f = evaluateApplication({
      material: COPPER,
      appliedAt: new Date('2026-11-15T10:00:00Z'),
      mode: 'organic_practices',
      history: [
        { material_key: 'copper', material_name: 'Basic copper sulfate', applied_at: '2026-03-01T10:00:00Z', applied_on: '2026-03-01' },
      ],
      library: LIBRARY,
    });
    const warning = f.find((x) => /per season/.test(x.message))!;
    expect(warning.message).not.toContain("your orchard's own limit");
  });

  it('does not count last season against this one', () => {
    const f = evaluateApplication({
      material: COPPER,
      appliedAt: new Date('2026-11-15T10:00:00Z'),
      mode: 'organic_practices',
      history: [
        { material_key: 'copper', material_name: 'Basic copper sulfate', applied_at: '2025-11-01T10:00:00Z', applied_on: '2025-11-01' },
      ],
      library: LIBRARY,
    });
    expect(f.some((x) => /per season/.test(x.message))).toBe(false);
  });
});

describe('REI / PHI', () => {
  it('reports re-entry and pre-harvest windows as info', () => {
    const f = evaluateApplication({
      material: CONVENTIONAL,
      appliedAt: MAY,
      mode: 'unrestricted',
      history: [],
      library: LIBRARY,
    });
    expect(f.some((x) => x.level === 'info' && /Re-entry/.test(x.message))).toBe(true);
    expect(f.some((x) => x.level === 'info' && /Pre-harvest/.test(x.message))).toBe(true);
  });
});

describe('availability and recommendation', () => {
  it('hides non-OMRI material from a certified orchard', () => {
    const list = availableMaterials(LIBRARY, 'certified_organic');
    expect(list.some((m) => m.material_key === 'malathion')).toBe(false);
    expect(list.length).toBe(LIBRARY.filter((m) => m.omri_listed).length);
  });

  it('ranks OMRI first in organic modes', () => {
    const organicOption = material({
      id: 5,
      material_key: 'kaolin',
      name: 'Kaolin clay',
      targets: ['apple_maggot'],
      conflicts_with: [],
      conflict_days: null,
    });
    const ranked = recommendFor([...LIBRARY, organicOption], 'apple_maggot', 'organic_practices');
    expect(ranked[0].material_key).toBe('kaolin');
  });

  it('prefers the more targeted material over a broad one', () => {
    const ranked = recommendFor(LIBRARY, 'apple_scab', 'organic_practices');
    // lime sulfur targets scab only; copper also targets anthracnose
    expect(ranked[0].material_key).toBe('lime_sulfur');
  });
});

describe('pre-harvest interval reporting', () => {
  it('dates the interval when one is recorded', () => {
    const f = evaluateApplication({
      material: material({ phi_days: 7 }),
      appliedAt: MAY,
      mode: 'organic_practices',
      history: [],
      library: LIBRARY,
    });
    expect(f.some((x) => x.level === 'info' && /Pre-harvest interval 7 days/.test(x.message))).toBe(true);
  });

  it('says plainly when a material may go on the day of picking', () => {
    const f = evaluateApplication({
      material: material({ phi_days: 0 }),
      appliedAt: MAY,
      mode: 'organic_practices',
      history: [],
      library: LIBRARY,
    });
    expect(f.some((x) => /up to the day of picking/.test(x.message))).toBe(true);
    expect(f.some((x) => /No pre-harvest interval is recorded/.test(x.message))).toBe(false);
  });

  it('warns that an UNRECORDED interval means unknown, not zero', () => {
    // Copper is the live case: its PHI varies by formulation, and this
    // orchard's late cider varieties are on the tree when it goes on.
    const f = evaluateApplication({
      material: material({ phi_days: null }),
      appliedAt: MAY,
      mode: 'organic_practices',
      history: [],
      library: LIBRARY,
    });
    const warn = f.find((x) => /No pre-harvest interval is recorded/.test(x.message));
    expect(warn?.level).toBe('warning');
    expect(warn?.message).toMatch(/unknown, not zero/);
  });
});
