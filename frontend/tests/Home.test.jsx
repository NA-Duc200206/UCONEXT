import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/pages/Home';

const { mockGetCategories, mockGetProducts, mockGetRecommended } = vi.hoisted(() => ({
  mockGetCategories: vi.fn(),
  mockGetProducts: vi.fn(),
  mockGetRecommended: vi.fn(),
}));

vi.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: null, updateUser: vi.fn() }),
}));

vi.mock('../src/context/CartContext', () => ({
  useCart: () => ({ addToCart: vi.fn() }),
}));

vi.mock('../src/context/WishlistContext', () => ({
  useWishlist: () => ({ isWishlisted: () => false, toggleWishlist: vi.fn() }),
}));

vi.mock('../src/context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../src/services/api', () => ({
  api: {
    categories: { getAll: mockGetCategories },
    products: {
      getAll: mockGetProducts,
      getRecommended: mockGetRecommended,
    },
    auth: {
      getRecentlyViewed: vi.fn().mockResolvedValue({ products: [] }),
    },
  },
}));

describe('Home page catalog & carousel image loading', () => {
  beforeEach(() => {
    mockGetCategories.mockReset().mockResolvedValue({
      categories: [{ _id: 'cat-1', name: 'Audio' }],
    });
    mockGetProducts.mockReset().mockResolvedValue({
      products: Array.from({ length: 14 }, (_, idx) => ({
        _id: `prod-${idx + 1}`,
        name: `Studio Item ${idx + 1}`,
        price: 500000 + idx * 10000,
        stock: 10,
        rating: 4.8,
        image: `https://images.unsplash.com/photo-${1500000000000 + idx}?w=800`,
        categoryId: { _id: 'cat-1', name: 'Audio' },
        category: { _id: 'cat-1', name: 'Audio' },
      })),
    });
    mockGetRecommended.mockReset().mockResolvedValue({
      products: [],
      personalized: false,
      matchedCategories: [],
    });
  });

  it('requests products within the backend limit (<= 100) and renders showcase & trending card images', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => expect(mockGetProducts).toHaveBeenCalledTimes(1));
    const reqArgs = mockGetProducts.mock.calls[0][0];
    expect(reqArgs.limit).toBeLessThanOrEqual(100);

    await waitFor(() => {
      // Highest-priced item leads FeaturedProductShowcase; remaining items populate TrendingSpotlight
      const showcaseImgs = screen.getAllByAltText('Studio Item 14');
      expect(showcaseImgs[0]).toHaveAttribute(
        'src',
        'https://images.unsplash.com/photo-1500000000013?w=800'
      );
      const trendingImgs = screen.getAllByAltText('Studio Item 2');
      expect(trendingImgs[0]).toHaveAttribute(
        'src',
        'https://images.unsplash.com/photo-1500000000001?w=800'
      );
    });
  });
});
