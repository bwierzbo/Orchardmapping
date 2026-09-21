import { describe, it, expect } from 'vitest';
import { roleAtLeast, ORCHARD_ROLES, ROLE_DESCRIPTION, type OrchardRole } from './roles';

describe('roleAtLeast', () => {
  it('lets a role satisfy its own requirement', () => {
    for (const r of ORCHARD_ROLES) expect(roleAtLeast(r, r)).toBe(true);
  });

  it('ranks admin over operator over viewer', () => {
    expect(roleAtLeast('admin', 'operator')).toBe(true);
    expect(roleAtLeast('admin', 'viewer')).toBe(true);
    expect(roleAtLeast('operator', 'viewer')).toBe(true);
  });

  it('refuses to promote upward — the whole point of the check', () => {
    expect(roleAtLeast('viewer', 'operator')).toBe(false);
    expect(roleAtLeast('viewer', 'admin')).toBe(false);
    expect(roleAtLeast('operator', 'admin')).toBe(false);
  });

  it('holds for every pair, so a new role cannot be added without a rank', () => {
    // Ordered weakest to strongest; the array order IS the ranking.
    for (let i = 0; i < ORCHARD_ROLES.length; i++) {
      for (let j = 0; j < ORCHARD_ROLES.length; j++) {
        expect(roleAtLeast(ORCHARD_ROLES[i], ORCHARD_ROLES[j])).toBe(i >= j);
      }
    }
  });

  it('describes every role, so the invite form can never show a blank', () => {
    for (const r of ORCHARD_ROLES) {
      expect(ROLE_DESCRIPTION[r as OrchardRole]).toBeTruthy();
    }
  });
});
