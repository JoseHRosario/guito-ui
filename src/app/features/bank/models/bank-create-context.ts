import type { CreateAndMatchInput } from './create-and-match-input';

export interface BankCreateContext {
  transactionId: string;
  prefill: { amount: string; description: string; date: string; category: string };
  input?: CreateAndMatchInput;
  completed?: boolean;
}
