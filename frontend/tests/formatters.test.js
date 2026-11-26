import { describe, it, expect } from 'vitest';
import {
  formatVND,
  formatDate,
  translateCategoryName,
  translateCategoryDesc,
  getCategoryEditorialImage,
  getSafeImageUrl,
  handleImageError,
  FALLBACK_IMAGE_URL,
} from '../src/utils/formatters.js';

describe('formatters utility suite', () => {
  it('formats VND currency accurately and handles non-numeric inputs safely', () => {
    expect(formatVND(1500000)).toBe('1,500,000 VND');
    expect(formatVND(299999.6)).toBe('300,000 VND');
    expect(formatVND(0)).toBe('0 VND');
    expect(formatVND(NaN)).toBe('0 VND');
    expect(formatVND(null)).toBe('0 VND');
    expect(formatVND(undefined)).toBe('0 VND');
  });

  it('formats valid ISO dates and returns empty string on invalid dates', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDate('2026-11-25T10:30:00.000Z')).toMatch(/2026/);
  });

  it('maps UCONEXT category names, descriptions, and editorial imagery consistently', () => {
    expect(translateCategoryName('Electronics')).toBe('Smart Technology');
    expect(translateCategoryName('Home & Living')).toBe('Home Living');
    expect(translateCategoryName('Audio')).toBe('Audio');
    expect(translateCategoryName('Custom Category')).toBe('Custom Category');

    expect(translateCategoryDesc('Skincare')).toMatch(/Serums/);
    expect(translateCategoryDesc('Unknown', 'Fallback copy')).toBe('Fallback copy');

    expect(getCategoryEditorialImage('Watches')).toMatch(/images\.unsplash\.com/);
    expect(getCategoryEditorialImage('NonExistent')).toMatch(/images\.unsplash\.com/);
  });

  it('guards broken or empty image URLs and applies fallback on DOM error events', () => {
    expect(getSafeImageUrl('')).toBe(FALLBACK_IMAGE_URL);
    expect(getSafeImageUrl(null)).toBe(FALLBACK_IMAGE_URL);
    expect(
      getSafeImageUrl('https://images.unsplash.com/photo-1590564313990-98a8d0d9a70e')
    ).not.toContain('photo-1590564313990-98a8d0d9a70e');
    expect(getSafeImageUrl('/uploads/prod_123.png')).toBe('/uploads/prod_123.png');

    const fakeImgTarget = { onerror: () => {}, src: 'broken.jpg' };
    handleImageError({ currentTarget: fakeImgTarget });
    expect(fakeImgTarget.onerror).toBeNull();
    expect(fakeImgTarget.src).toBe(FALLBACK_IMAGE_URL);
  });
});
