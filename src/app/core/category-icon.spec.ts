import { describe, expect, it } from 'vitest';
import { categoryIcon } from './category-icon';

describe('categoryIcon', () => {
  it('maps known categories to their glyphs (case-insensitive)', () => {
    expect(categoryIcon('Clothing')).toBe('tag');
    expect(categoryIcon('BILLS')).toBe('zap');
    expect(categoryIcon('Entertainment')).toBe('film');
  });

  it('falls back to the tag glyph for unknown categories', () => {
    expect(categoryIcon('New Category')).toBe('tag');
    expect(categoryIcon('')).toBe('tag');
  });
});