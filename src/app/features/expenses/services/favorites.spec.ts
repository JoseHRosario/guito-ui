import { describe, expect, it } from 'vitest';

import { FAVORITES } from './favorites';

describe('FAVORITES seed (issue #43, ADR 0012)', () => {
  it('carries a valid preset for every favorite', () => {
    expect(FAVORITES.length).toBeGreaterThan(0);
    for (const favorite of FAVORITES) {
      expect(favorite.name.trim()).not.toBe('');
      expect(favorite.description.trim()).not.toBe('');
      expect(favorite.category.trim()).not.toBe('');
      // ADR 0010: amounts are stored positive — a non-positive favorite could
      // never be saved (the API rejects non-positive amounts with 400).
      expect(favorite.amount).toBeGreaterThan(0);
    }
  });

  it('seeds Morning Coffee against the existing sheet category', () => {
    const coffee = FAVORITES.find((f) => f.name === 'Morning Coffee');
    expect(coffee).toEqual({ name: 'Morning Coffee', amount: 2.3, description: 'Coco Verde', category: 'Eating out' });
  });
});
