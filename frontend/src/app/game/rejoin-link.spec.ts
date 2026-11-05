import { rejoinCode } from './rejoin-link.component';

describe('rejoinCode', () => {
  it('reads the code from a rejoin link\'s fragment, and nothing else', () => {
    expect(rejoinCode('rejoin=abc_D-9')).toBe('abc_D-9');
    expect(rejoinCode('rejoin=')).toBeUndefined();
    expect(rejoinCode('players')).toBeUndefined();
    expect(rejoinCode(null)).toBeUndefined();
    expect(rejoinCode(undefined)).toBeUndefined();
  });
});
