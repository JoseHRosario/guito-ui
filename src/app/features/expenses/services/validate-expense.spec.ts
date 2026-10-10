import { amountDecimal, parseAmount, validateExpenseInput } from './validate-expense';

describe('parseAmount (pt-PT comma decimal, issue #32)', () => {
  it('accepts comma decimals like 65,55', () => {
    expect(parseAmount('65,55')).toBe('65.55');
  });

  it('accepts dot decimals like 65.55', () => {
    expect(parseAmount('65.55')).toBe('65.55');
  });

  it('accepts whole amounts with surrounding spaces', () => {
    expect(parseAmount(' 80 ')).toBe('80');
  });

  it('normalizes represented numeric compatibility values without exponent transport', () => {
    expect(amountDecimal(2.3)).toBe('2.3');
    expect(amountDecimal(1e-7)).toBe('0.0000001');
    expect(amountDecimal(1e21)).toBe('1000000000000000000000');
    expect(amountDecimal(Infinity)).toBeNull();
    expect(amountDecimal(NaN)).toBeNull();
    expect(amountDecimal(1e-29)).toBeNull();
  });

  it('normalizes insignificant zeros while preserving all significant digits', () => {
    expect(parseAmount(' 000123456789,1234567890 ')).toBe('123456789.123456789');
    expect(parseAmount('9007199254740993')).toBe('9007199254740993');
    expect(parseAmount('0.0000000000000000000000000001')).toBe('0.0000000000000000000000000001');
    expect(parseAmount('79228162514264337593543950335')).toBe('79228162514264337593543950335');
    expect(parseAmount('79228162514264337593543950336')).toBeNull();
    expect(parseAmount('0.00000000000000000000000000001')).toBeNull();
  });

  it('normalizes signed amounts and negative zero without losing precision', () => {
    expect(parseAmount('-0001,2500')).toBe('-1.25');
    expect(parseAmount('+1.25')).toBe('1.25');
    expect(parseAmount('-0.000')).toBe('0');
    expect(parseAmount('0')).toBe('0');
    expect(parseAmount('-123456789.123456789')).toBe('-123456789.123456789');
    expect(parseAmount('-79228162514264337593543950335')).toBe('-79228162514264337593543950335');
    expect(parseAmount('-79228162514264337593543950336')).toBeNull();
    expect(amountDecimal(-0)).toBe('0');
  });

  it('rejects empty, malformed and non-numeric input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('--5')).toBeNull();
    expect(parseAmount('+-5')).toBeNull();
    expect(parseAmount('65,55,55')).toBeNull();
  });
});

const NONE = { amount: '', description: '', date: '', category: '' };

describe('validateExpenseInput (frame 3094:9937 rules)', () => {
  const valid = { amount: '65,55', description: 'Veggies', date: '2026-10-01', category: 'Clothing' };

  it('passes a fully valid input', () => {
    expect(validateExpenseInput(valid)).toEqual(NONE);
  });

  it('flags a missing amount but accepts signed and zero amounts', () => {
    expect(validateExpenseInput({ ...valid, amount: '' }).amount).toBeTruthy();
    expect(validateExpenseInput({ ...valid, amount: '0' })).toEqual(NONE);
    expect(validateExpenseInput({ ...valid, amount: '-1.25' })).toEqual(NONE);
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
