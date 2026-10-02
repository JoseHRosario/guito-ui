import { parseAmount, validateExpenseInput } from './validate-expense';

describe('parseAmount (pt-PT comma decimal, issue #32)', () => {
  it('accepts comma decimals like 65,55', () => {
    expect(parseAmount('65,55')).toBe(65.55);
  });

  it('accepts dot decimals like 65.55', () => {
    expect(parseAmount('65.55')).toBe(65.55);
  });

  it('accepts whole amounts with surrounding spaces', () => {
    expect(parseAmount(' 80 ')).toBe(80);
  });

  it('rejects empty, non-numeric, and non-positive input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('65,55,55')).toBeNull();
  });
});

const NONE = { amount: '', description: '', date: '', category: '' };

describe('validateExpenseInput (frame 3094:9937 rules)', () => {
  const valid = { amount: '65,55', description: 'Veggies', date: '2026-10-01', category: 'Clothing' };

  it('passes a fully valid input', () => {
    expect(validateExpenseInput(valid)).toEqual(NONE);
  });

  it('flags a missing/non-positive amount', () => {
    expect(validateExpenseInput({ ...valid, amount: '' }).amount).toBeTruthy();
    expect(validateExpenseInput({ ...valid, amount: '0' }).amount).toBeTruthy();
  });

  it('flags an empty description', () => {
    expect(validateExpenseInput({ ...valid, description: '  ' }).description).toBeTruthy();
  });

  it('flags an absent or malformed date', () => {
    expect(validateExpenseInput({ ...valid, date: '' }).date).toBeTruthy();
    expect(validateExpenseInput({ ...valid, date: '2026-13-40' }).date).toBeTruthy();
  });

  it('flags a missing category', () => {
    expect(validateExpenseInput({ ...valid, category: '' }).category).toBeTruthy();
  });

  it('allows past and future dates', () => {
    expect(validateExpenseInput({ ...valid, date: '2020-01-01' })).toEqual(NONE);
    expect(validateExpenseInput({ ...valid, date: '2030-01-01' })).toEqual(NONE);
  });
});
