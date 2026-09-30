import type { IconName } from '../shared/gicon';

/**
 * Maps the API Expense category to its list-row lucide glyph. Falls back to
 * 'tag' for unknown categories (the API owns the category strings — new ones
 * must not break rendering).
 */
export function categoryIcon(category: string): IconName {
  const ICONS: Readonly<Record<string, IconName>> = {
    clothing: 'tag',
    broadband: 'wifi',
    shopping: 'shopping-bag',
    bills: 'zap',
    entertainment: 'film',
    snacks: 'utensils',
    health: 'heart',
  };
  return ICONS[category.toLowerCase()] ?? 'tag';
}