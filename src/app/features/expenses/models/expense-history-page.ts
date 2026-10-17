/** Live occurrence-ordered Postgres page; not a frozen snapshot. */
export interface ExpenseHistoryPage {
  pageSize: number;
  pageIndex: number;
  totalCount: number;
  hasMore: boolean;
  expenses: {
    id: number;
    amount: string;
    currency: string;
    bookingDate: string;
    description: string;
    category: string;
  }[];
}
