/** Pure form validation for the Create Expense screen (issue #32, frame 3094:9937 rules). */

/** Normalize a signed .NET decimal without binary floating point rounding. */
export function parseAmount(input: string): string | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;
  const sign = normalized.startsWith('-') ? '-' : '';
  const [whole, fraction = ''] = normalized.replace(/^[+-]/, '').split('.');
  const integer = whole.replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  const coefficient = (integer + decimals).replace(/^0+/, '') || '0';
  if (decimals.length > 28 || coefficient.length > 29 ||
      (coefficient.length === 29 && coefficient > '79228162514264337593543950335')) return null;
  return (coefficient === '0' ? '' : sign) + integer + (decimals ? `.${decimals}` : '');
}

/** Numeric compatibility preserves the represented value, not invented precision. */
export function amountDecimal(amount: number | string): string | null {
  if (typeof amount === 'string') return parseAmount(amount);
  if (!Number.isFinite(amount)) return null;
  const text = String(amount);
  if (!text.includes('e')) return parseAmount(text);
  const sign = text.startsWith('-') ? '-' : '';
  const [mantissa, exponent] = text.replace(/^-/, '').split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` :
    point >= digits.length ? digits + '0'.repeat(point - digits.length) :
    `${digits.slice(0, point)}.${digits.slice(point)}`;
  return parseAmount(sign + expanded);
}

export interface ExpenseInput {
  amount: string;
  description: string;
  /** ISO yyyy-MM-dd (assembled from the dd/mm/yyyy segments). */
  date: string;
  category: string;
}

export type ExpenseFieldErrors = Record<keyof ExpenseInput, string>;

/** Maps each invalid field to its inline helper-text message; empty object = valid. */
export function validateExpenseInput(input: ExpenseInput): ExpenseFieldErrors {
  const errors: ExpenseFieldErrors = { amount: '', description: '', date: '', category: '' };
  if (parseAmount(input.amount) === null) errors.amount = 'Enter a valid decimal amount';
  if (input.description.trim() === '') errors.description = 'Enter a description';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(new Date(`${input.date}T12:00:00`).getTime())) {
    errors.date = 'Enter a valid date';
  }
  if (input.category.trim() === '') errors.category = 'Select a category';
  return errors;
}
