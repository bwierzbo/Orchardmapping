import { describe, it, expect } from 'vitest';
import { ciderpilotConnection } from './ciderpilot-client';

describe('ciderpilotConnection', () => {
  it('is null unless both the address and the token are set', () => {
    expect(ciderpilotConnection({})).toBeNull();
    expect(ciderpilotConnection({ CIDERPILOT_URL: 'https://cider.example' })).toBeNull();
    expect(ciderpilotConnection({ CIDERPILOT_TOKEN: 'cpi_x' })).toBeNull();
    expect(ciderpilotConnection({ CIDERPILOT_URL: '  ', CIDERPILOT_TOKEN: 'cpi_x' })).toBeNull();
  });

  it('trims both and drops a trailing slash from the address', () => {
    expect(
      ciderpilotConnection({ CIDERPILOT_URL: ' https://cider.example// ', CIDERPILOT_TOKEN: ' cpi_x ' }),
    ).toEqual({ url: 'https://cider.example', token: 'cpi_x' });
  });
});
