/** Pure form validation for the Create Expense screen (issue #32, frame 3094:9937 rules). */

/** Parses a pt-PT-friendly amount ('65,55', '65.55', '80'); null unless finite and > 0. */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface ExpenseInput {
  amount: string;
  description: string;
  /** ISO yyyy-MM-dd (assembled from the dd/mm/yyyy segments). */
  date: string;
  category: string;
}

export type ExpenseFieldErrors = Record<keyof ExpenseInput, string>;

function isValidDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const date = new Date(`${input}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === input;
}

/** Maps each invalid field to its inline helper-text message; empty object = valid. */
export function validateExpenseInput(input: ExpenseInput): ExpenseFieldErrors {
  const errors: ExpenseFieldErrors = { amount: '', description: '', date: '', category: '' };
  if (parseAmount(input.amount) === null) errors.amount = 'Enter an amount greater than 0';
  if (input.description.trim() === '') errors.description = 'Enter a description';
  if (!isValidDate(input.date)) {
    errors.date = 'Enter a valid date';
  }
  if (input.category.trim() === '') errors.category = 'Select a category';
  return errors;
}
