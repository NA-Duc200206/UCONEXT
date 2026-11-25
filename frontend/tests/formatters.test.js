import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.equal(formatVND(1500000), '1,500,000 VND');
    assert.equal(formatVND(299999.6), '300,000 VND');
    assert.equal(formatVND(0), '0 VND');
    assert.equal(formatVND(NaN), '0 VND');
    assert.equal(formatVND(null), '0 VND');
    assert.equal(formatVND(undefined), '0 VND');
  });

  it('formats valid ISO dates and returns empty string on invalid dates', () => {
    assert.equal(formatDate(''), '');
    assert.equal(formatDate('not-a-date'), '');
    const formatted = formatDate('2026-11-25T10:30:00.000Z');
    assert.match(formatted, /2026/);
  });

  it('maps UCONEXT category names, descriptions, and editorial imagery consistently', () => {
    assert.equal(translateCategoryName('Electronics'), 'Smart Technology');
    assert.equal(translateCategoryName('Home & Living'), 'Home Living');
    assert.equal(translateCategoryName('Audio'), 'Audio');
    assert.equal(translateCategoryName('Custom Category'), 'Custom Category');

    assert.match(translateCategoryDesc('Skincare'), /Serums/);
    assert.equal(translateCategoryDesc('Unknown', 'Fallback copy'), 'Fallback copy');

    assert.match(getCategoryEditorialImage('Watches'), /images\.unsplash\.com/);
    assert.match(getCategoryEditorialImage('NonExistent'), /images\.unsplash\.com/);
  });

  it('guards broken or empty image URLs and applies fallback on DOM error events', () => {
    assert.equal(getSafeImageUrl(''), FALLBACK_IMAGE_URL);
    assert.equal(getSafeImageUrl(null), FALLBACK_IMAGE_URL);
    assert.equal(
      getSafeImageUrl('https://images.unsplash.com/photo-1590564313990-98a8d0d9a70e').includes(
        'photo-1590564313990-98a8d0d9a70e'
      ),
      false
    );
    assert.equal(getSafeImageUrl('/uploads/prod_123.png'), '/uploads/prod_123.png');

    const fakeImgTarget = { onerror: () => {}, src: 'broken.jpg' };
    handleImageError({ currentTarget: fakeImgTarget });
    assert.equal(fakeImgTarget.onerror, null);
    assert.equal(fakeImgTarget.src, FALLBACK_IMAGE_URL);
  });
});
