import { describe, expect, it } from 'vitest';
import { formatEur } from './money';

describe('formatEur', () => {
  it('formats a negative amount with a minus sign and a trailing euro sign', () => {
    expect(formatEur(-65.55)).toMatch(/^-65,55\s+€$/);
  });

  it('formats a positive amount without a plus sign by default', () => {
    expect(formatEur(4853.72)).toMatch(/^4[ .]?853,72\s+€$/);
  });

  it('always signs positive amounts when signed is requested (sidebar wallet)', () => {
    expect(formatEur(12450, { signed: true })).toMatch(/^\+12[ .\u00a0\u202f]450,00\s+€$/);
  });

  it('keeps two decimal places', () => {
    expect(formatEur(-80)).toMatch(/^-80,00\s+€$/);
  });
});
