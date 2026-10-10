/** A Favorite: a saved Expense preset that creates an Expense in one tap (guito-ui#43, ADR 0012). */
export interface Favorite {
  readonly name: string;
  readonly amount: number;
  readonly description: string;
  readonly category: string;
}

/**
 * Hardcoded v1 seed (ADR 0012: client-side constants until the Postgres-backed,
 * user-configurable favorites land). `category` must match an API category
 * name; signed and zero amounts are valid. Presets are posted as supplied,
 * without inferring or reversing their sign.
 */
export const FAVORITES: readonly Favorite[] = [
  { name: 'Morning Coffee', amount: 2.3, description: 'Coco Verde', category: 'Eating out' },
];
