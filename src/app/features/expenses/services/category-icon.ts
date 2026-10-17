import type { IconName } from '../../../shared/gicon';

/** Maps the API's category to its list-row lucide glyph; 'tag' fallback for unknown categories. */
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
