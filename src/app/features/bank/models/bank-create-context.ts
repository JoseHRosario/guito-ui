export interface BankCreateContext {
  transactionId: string;
  prefill: { amount: string; description: string; date: string; category: string };
  submitted?: boolean;
}
