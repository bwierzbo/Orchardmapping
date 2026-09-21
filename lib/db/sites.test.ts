import { describe, it, expect } from 'vitest';
import { deriveSiteCode, resolveSiteForNewOrchard, nextOrchardCode } from './sites';

/** A pg client stub: answers each query from a scripted list, records writes. */
function stubClient(answers: Record<string, Record<string, unknown>[]>) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  return {
    writes,
    client: {
      async query(sql: string, params: unknown[] = []) {
        writes.push({ sql, params });
        const key = Object.keys(answers).find((k) => sql.includes(k));
        return { rows: key ? answers[key] : [] };
      },
    },
  };
}

describe('deriveSiteCode', () => {
  it('takes the initials of the significant words', () => {
    expect(deriveSiteCode('Olympic Bluffs Cidery')).toBe('OBC');
    expect(deriveSiteCode('Farm House Orchard')).toBe('FHO');
  });

  it('skips joining words, so an "and" does not steal a letter', () => {
    expect(deriveSiteCode('Marty Huffman and Michelle McGuiness Orchard')).toBe('MHM');
  });

  it('falls back to the first characters when a name has too few words', () => {
    expect(deriveSiteCode('Manytrees')).toBe('MAN');
  });

  it('ignores punctuation rather than emitting an invalid code', () => {
    expect(deriveSiteCode("St. Mary's Orchard")).toBe('SMO');
    expect(deriveSiteCode('—')).toMatch(/^[A-Z][A-Z0-9]{1,5}$/);
  });

  it('produces something the sites CHECK constraint accepts', () => {
    for (const name of ['A', 'Olympic Bluffs Cidery', '123 Farm', 'x', '  ']) {
      expect(deriveSiteCode(name)).toMatch(/^[A-Z][A-Z0-9]{1,5}$/);
    }
  });
});

describe('resolveSiteForNewOrchard', () => {
  it('adds to the site someone already works in', async () => {
    const { client, writes } = stubClient({ 'FROM orchard_members': [{ site_id: 'obc' }] });
    const site = await resolveSiteForNewOrchard(client, 'user_1', 'Second Block');
    expect(site).toBe('obc');
    expect(writes.some((w) => w.sql.includes('INSERT INTO sites'))).toBe(false);
  });

  it('gives a brand-new grower a site of their own', async () => {
    const { client, writes } = stubClient({ 'FROM orchard_members': [] });
    const site = await resolveSiteForNewOrchard(client, 'user_new', 'Sunny Slope Orchard');
    expect(site).toBe('sunny-slope-orchard');
    const insert = writes.find((w) => w.sql.includes('INSERT INTO sites'));
    expect(insert?.params).toEqual(['sunny-slope-orchard', 'SSO', 'Sunny Slope Orchard']);
  });

  it('does not guess for someone who spans several sites', async () => {
    const { client, writes } = stubClient({
      'FROM orchard_members': [{ site_id: 'obc' }, { site_id: 'fho' }],
    });
    const site = await resolveSiteForNewOrchard(client, 'user_staff', 'Third Place');
    expect(site).toBe('third-place');
    expect(writes.some((w) => w.sql.includes('INSERT INTO sites'))).toBe(true);
  });
});

describe('nextOrchardCode', () => {
  it('starts a new site at 001', async () => {
    const { client } = stubClient({ 'FROM orchards WHERE site_id': [{ highest: 0 }] });
    expect(await nextOrchardCode(client, 'new-site')).toBe('001');
  });

  it('counts up from the highest ever used, never filling a gap', async () => {
    // 002 was deleted; the next orchard must still be 004, or its trees
    // would carry ids reading as the deleted orchard's.
    const { client } = stubClient({ 'FROM orchards WHERE site_id': [{ highest: 3 }] });
    expect(await nextOrchardCode(client, 'obc')).toBe('004');
  });

  it('pads to three digits', async () => {
    const { client } = stubClient({ 'FROM orchards WHERE site_id': [{ highest: 11 }] });
    expect(await nextOrchardCode(client, 'obc')).toBe('012');
  });
});
