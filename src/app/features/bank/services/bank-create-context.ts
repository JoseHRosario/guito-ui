import type { BankCreateContext } from '../models/bank-create-context';
import { parseAmount } from '../../expenses/services/validate-expense';
import { knownOccurrence } from '../../expenses/services/expense-time';
import { validBankId } from './bank-api';

const key = (id: string) => `guito.bank-create.${id}`;
export function storeBankCreate(context: BankCreateContext): void {
  sessionStorage.setItem(key(context.transactionId), JSON.stringify(context));
  if (sessionStorage.getItem(key(context.transactionId)) !== JSON.stringify(context)) throw new Error('storage-unavailable');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bank-context-invalid');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('bank-context-invalid');
  return value;
}
function amount(value: unknown): string {
  const result = text(value);
  if (parseAmount(result) !== result) throw new Error('bank-context-invalid');
  return result;
}
function date(value: unknown): string {
  const result = text(value);
  if (!knownOccurrence(result) && !(/^\d{4}-\d{2}-\d{2}$/.test(result) && knownOccurrence(`${result}T12:00:00Z`))) throw new Error('bank-context-invalid');
  return result;
}
export function readBankCreate(id: string): BankCreateContext {
  if (!validBankId(id)) throw new Error('bank-id-invalid');
  const context = record(JSON.parse(sessionStorage.getItem(key(id)) ?? 'null') as unknown);
  const p = record(context['prefill']);
  if (context['transactionId'] !== id || (context['submitted'] !== undefined && typeof context['submitted'] !== 'boolean')) throw new Error('bank-context-invalid');
  const result: BankCreateContext = { transactionId: id, prefill: {
    amount: amount(p['amount']), description: text(p['description']), date: date(p['date']), category: text(p['category']),
  } };
  if (context['submitted'] === true) result.submitted = true;
  return result;
}
