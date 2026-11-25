import mongoose from 'mongoose';
import { Product, Category, Order, Review } from '../models';
import { cacheService, toSlug } from '../utils/cache';
import { auditService } from './auditService';

const REPEAT_PURCHASE_CATEGORIES = new Set([
  'Skincare',
  'Fragrance',
  'Makeup, Hair',
  'Kitchen, Coffee'
]);

export interface ProductQueryParams {
  search?: string;
  categoryId?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  inStock?: string | boolean;
  minRating?: string | number;
  page?: string | number;
  limit?: string | number;
  sort?: string;
}

function escapeProductSearchRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const productService = {
  async getAll(params: ProductQueryParams) {
    const {
      search,
      categoryId,
      minPrice,
      maxPrice,
      inStock,
      minRating,
      page = '1',
      limit = '9',
      sort,
    } = params || {};

    const parsedPage = parseInt(page.toString(), 10);
    const parsedLimit = parseInt(limit.toString(), 10);
    const pageNum = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limitNum = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 1200) : 9;
    const parsedMinRating = minRating !== undefined ? parseFloat(String(minRating)) : 0;
    const requireInStock = inStock === true || inStock === 'true' || inStock === '1';
    const normalizedSort = String(sort || '').trim().toLowerCase();

    const cacheKey = `cache:products:list:${JSON.stringify({
      s: search ? String(search).trim().toLowerCase() : '',
      c: categoryId || '',
      minP: minPrice ?? '',
      maxP: maxPrice ?? '',
      stock: requireInStock ? 1 : 0,
      minR: parsedMinRating > 0 ? parsedMinRating : 0,
      p: pageNum,
      l: limitNum,
      sort: normalizedSort,
    })}`;

    const cachedResult = await cacheService.get<any>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const query: any = { isDeleted: { $ne: true } };

    if (search) {
      const trimmedSearch = search.toString().trim().slice(0, 120);
      if (trimmedSearch) {
        query.name = { $regex: escapeProductSearchRegex(trimmedSearch), $options: 'i' };
      }
    }

    if (requireInStock) {
      query.stock = { $gt: 0 };
    }

    if (categoryId) {
      const rawIds = typeof categoryId === 'string' && categoryId.includes(',')
        ? categoryId.split(',').map((s) => s.trim()).filter(Boolean)
        : [String(categoryId).trim()];
      const validIds = rawIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length === 0) {
        return {
          products: [],
          totalProducts: 0,
          totalPages: 0,
          currentPage: pageNum,
          limit: limitNum
        };
      }
      query.categoryId = validIds.length > 1 ? { $in: validIds } : validIds[0];
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      const minVal = minPrice !== undefined && minPrice !== '' ? parseFloat(minPrice.toString()) : NaN;
      const maxVal = maxPrice !== undefined && maxPrice !== '' ? parseFloat(maxPrice.toString()) : NaN;
      if (Number.isFinite(minVal) || Number.isFinite(maxVal)) {
        query.price = {};
        if (Number.isFinite(minVal)) query.price.$gte = minVal;
        if (Number.isFinite(maxVal)) query.price.$lte = maxVal;
      }
    }

    const needsRatingFilterOrSort =
      (Number.isFinite(parsedMinRating) && parsedMinRating > 0) ||
      normalizedSort === 'rating_desc' ||
      normalizedSort === 'rating-desc';

    const skip = (pageNum - 1) * limitNum;

    if (needsRatingFilterOrSort) {
      const [allMatching, reviewStats] = await Promise.all([
        Product.find(query).populate('categoryId', 'name slug'),
        Review.aggregate([
          { $match: { isDeleted: false } },
          {
            $group: {
              _id: '$productId',
              avgRating: { $avg: '$rating' },
              reviewCount: { $sum: 1 },
            },
          },
        ]),
      ]);

      const ratingMap = new Map<string, { rating: number; reviewCount: number }>(
        reviewStats.map((r: any) => [
          String(r._id),
          { rating: Number(Number(r.avgRating || 0).toFixed(1)), reviewCount: Number(r.reviewCount) || 0 },
        ])
      );

      let enriched = allMatching.map((p) => {
        const obj = p.toObject();
        const stats = ratingMap.get(String(obj._id)) || { rating: 0, reviewCount: 0 };
        return {
          ...obj,
          id: obj._id,
          category: obj.categoryId,
          rating: stats.rating,
          reviewCount: stats.reviewCount,
        };
      });

      if (Number.isFinite(parsedMinRating) && parsedMinRating > 0) {
        enriched = enriched.filter((item) => item.rating >= parsedMinRating);
      }

      if (normalizedSort === 'price_asc' || normalizedSort === 'price-asc') {
        enriched.sort((a, b) => a.price - b.price);
      } else if (normalizedSort === 'price_desc' || normalizedSort === 'price-desc') {
        enriched.sort((a, b) => b.price - a.price);
      } else if (normalizedSort === 'name_asc') {
        enriched.sort((a, b) => a.name.localeCompare(b.name));
      } else if (normalizedSort === 'name_desc') {
        enriched.sort((a, b) => b.name.localeCompare(a.name));
      } else {
        enriched.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
      }

      const totalProducts = enriched.length;
      const totalPages = Math.ceil(totalProducts / limitNum);
      const paged = enriched.slice(skip, skip + limitNum);

      const responsePayload = {
        products: paged,
        totalProducts,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      };
      await cacheService.set(cacheKey, responsePayload, 60);
      return responsePayload;
    }

    let sortOption: any = { createdAt: -1 };
    if (normalizedSort === 'price_asc' || normalizedSort === 'price-asc') sortOption = { price: 1 };
    else if (normalizedSort === 'price_desc' || normalizedSort === 'price-desc') sortOption = { price: -1 };
    else if (normalizedSort === 'name_asc') sortOption = { name: 1 };
    else if (normalizedSort === 'name_desc') sortOption = { name: -1 };

    const [products, totalProducts] = await Promise.all([
      Product.find(query)
        .populate('categoryId', 'name slug')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Product.countDocuments(query)
    ]);

    const pageIds = products.map((p) => p._id);
    const pageReviewStats =
      pageIds.length > 0
        ? await Review.aggregate([
            { $match: { productId: { $in: pageIds }, isDeleted: false } },
            {
              $group: {
                _id: '$productId',
                avgRating: { $avg: '$rating' },
                reviewCount: { $sum: 1 },
              },
            },
          ])
        : [];

    const pageRatingMap = new Map<string, { rating: number; reviewCount: number }>(
      pageReviewStats.map((r: any) => [
        String(r._id),
        { rating: Number(Number(r.avgRating || 0).toFixed(1)), reviewCount: Number(r.reviewCount) || 0 },
      ])
    );

    const totalPages = Math.ceil(totalProducts / limitNum);

    const formattedProducts = products.map((p) => {
      const obj = p.toObject();
      const stats = pageRatingMap.get(String(obj._id)) || { rating: 0, reviewCount: 0 };
      return {
        ...obj,
        id: obj._id,
        category: obj.categoryId,
        rating: stats.rating,
        reviewCount: stats.reviewCount,
      };
    });

    const responsePayload = {
      products: formattedProducts,
      totalProducts,
      totalPages,
      currentPage: pageNum,
      limit: limitNum
    };

    await cacheService.set(cacheKey, responsePayload, 60);
    return responsePayload;
  },

  async getById(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error: any = new Error('Product does not exist.');
      error.statusCode = 404;
      throw error;
    }

    const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } }).populate('categoryId', 'name slug');
    if (!product) {
      const error: any = new Error('Product does not exist.');
      error.statusCode = 404;
      throw error;
    }

    const obj = product.toObject();
    return {
      ...obj,
      id: obj._id,
      category: obj.categoryId
    };
  },

  async create(
    data: {
      name: string;
      price: number;
      stock: number;
      description?: string;
      image?: string;
      options?: any;
      categoryId: string;
    },
    actorId?: string,
    ipAddress?: string
  ) {
    const { name, price, stock, description, image, options, categoryId } = data;

    if (!name || price === undefined || stock === undefined || !categoryId) {
      const error: any = new Error('Please provide all required fields.');
      error.statusCode = 400;
      throw error;
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      const error: any = new Error('Invalid category.');
      error.statusCode = 400;
      throw error;
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      const error: any = new Error('Invalid category.');
      error.statusCode = 400;
      throw error;
    }

    const baseSlug = toSlug(name) || `product-${Date.now()}`;
    const slugConflict = await Product.findOne({ slug: baseSlug });
    const slug = slugConflict ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

    const product = await Product.create({
      name: name.trim(),
      slug,
      price: Number(price),
      stock: Number(stock),
      description,
      image,
      options: options || { colors: [], sizes: [] },
      categoryId: categoryId as any
    });

    await cacheService.invalidateByPrefix('cache:products:', 'cache:categories:', 'cache:analytics:');
    await auditService.record({
      userId: actorId,
      action: 'PRODUCT_CREATE',
      targetType: 'Product',
      targetId: String(product._id),
      newValue: { name: product.name, price: product.price, stock: product.stock },
      ipAddress,
    });

    return product;
  },

  async update(id: string, data: any, actorId?: string, ipAddress?: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error: any = new Error('Product does not exist.');
      error.statusCode = 404;
      throw error;
    }
    const product = await Product.findById(id);
    if (!product || product.isDeleted) {
      const error: any = new Error('Product does not exist.');
      error.statusCode = 404;
      throw error;
    }

    const oldSnapshot = {
      name: product.name,
      price: product.price,
      stock: product.stock,
      categoryId: String(product.categoryId),
    };

    if (data.categoryId) {
      if (!mongoose.Types.ObjectId.isValid(data.categoryId)) {
        const error: any = new Error('Invalid category.');
        error.statusCode = 400;
        throw error;
      }
      const category = await Category.findById(data.categoryId);
      if (!category) {
        const error: any = new Error('Invalid category.');
        error.statusCode = 400;
        throw error;
      }
      product.categoryId = data.categoryId;
    }

    if (data.name) {
      const nextName = String(data.name).trim();
      const nextSlugBase = toSlug(nextName) || product.slug;
      const conflict = await Product.findOne({ _id: { $ne: product._id } as any, slug: nextSlugBase });
      product.name = nextName;
      product.slug = conflict ? `${nextSlugBase}-${Date.now().toString(36)}` : nextSlugBase;
    }
    if (data.price !== undefined) product.price = Number(data.price);
    if (data.stock !== undefined) product.stock = Number(data.stock);
    if (data.description !== undefined) product.description = data.description;
    if (data.image !== undefined) product.image = data.image;
    if (data.options !== undefined) product.options = data.options;

    await product.save();
    await cacheService.invalidateByPrefix('cache:products:', 'cache:categories:', 'cache:analytics:');
    await auditService.record({
      userId: actorId,
      action: 'PRODUCT_UPDATE',
      targetType: 'Product',
      targetId: String(product._id),
      oldValue: oldSnapshot,
      newValue: {
        name: product.name,
        price: product.price,
        stock: product.stock,
        categoryId: String(product.categoryId),
      },
      ipAddress,
    });
    return product;
  },

  async delete(id: string, actorId?: string, ipAddress?: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error: any = new Error('Product does not exist.');
      error.statusCode = 404;
      throw error;
    }
    const product = await Product.findById(id);
    if (!product || product.isDeleted) {
      const error: any = new Error('Product does not exist.');
      error.statusCode = 404;
      throw error;
    }

    product.isDeleted = true;
    await product.save();

    await cacheService.invalidateByPrefix('cache:products:', 'cache:categories:', 'cache:analytics:');
    await auditService.record({
      userId: actorId,
      action: 'PRODUCT_DELETE',
      targetType: 'Product',
      targetId: String(product._id),
      oldValue: { name: product.name, price: product.price, stock: product.stock },
      ipAddress,
    });
    return true;
  },

  async getRecommended(userDoc: any | undefined, limitInput: number = 8) {
    const limit = Math.min(Math.max(Math.floor(Number(limitInput)) || 8, 1), 48);

    const [inStockCandidates, reviewStats] = await Promise.all([
      Product.find({ isDeleted: { $ne: true }, stock: { $gt: 0 } })
        .populate('categoryId', 'name slug')
        .lean(),
      Review.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $group: {
            _id: '$productId',
            avgRating: { $avg: '$rating' },
            reviewCount: { $sum: 1 }
          }
        }
      ])
    ]);

    const candidates = inStockCandidates.length > 0
      ? inStockCandidates
      : await Product.find({ isDeleted: { $ne: true } })
          .populate('categoryId', 'name slug')
          .lean();

    const ratingMap = new Map<string, { avgRating: number; reviewCount: number }>();
    for (const stat of reviewStats) {
      ratingMap.set(String(stat._id), {
        avgRating: Number(stat.avgRating || 0),
        reviewCount: Number(stat.reviewCount || 0)
      });
    }

    const productById = new Map<string, any>();
    const categoryNameMap = new Map<string, string>();
    for (const p of candidates) {
      productById.set(String(p._id), p);
      const catId = String((p.categoryId as any)?._id || p.categoryId || '');
      const catName = (p.categoryId as any)?.name;
      if (catId && catName && !categoryNameMap.has(catId)) {
        categoryNameMap.set(catId, catName);
      }
    }

    const categoryWeights = new Map<string, number>();
    const recentlyPurchasedIds = new Set<string>();

    const addWeight = (catId: string, weight: number) => {
      if (!catId) return;
      categoryWeights.set(catId, (categoryWeights.get(catId) || 0) + weight);
    };

    if (userDoc) {
      for (const catId of userDoc.preferredCategories || []) {
        addWeight(String(catId), 10);
      }

      const recentOrders = await Order.find({
        userId: userDoc._id,
        status: { $ne: 'cancelled' }
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('items')
        .lean();

      const wishlistIds = (userDoc.wishlist || []).map((id: any) => String(id));
      const recentlyViewedEntries = (userDoc.recentlyViewed || [])
        .map((entry: any) => String(entry?.productId || ''))
        .filter(Boolean);
      const orderProductIds: string[] = [];
      for (const order of recentOrders) {
        for (const item of order.items || []) {
          if (item?.productId) {
            const pid = String(item.productId);
            recentlyPurchasedIds.add(pid);
            orderProductIds.push(pid);
          }
        }
      }

      const allReferencedIds = Array.from(new Set([...wishlistIds, ...recentlyViewedEntries, ...orderProductIds]));
      const missingProductIds = allReferencedIds.filter((pid) => !productById.has(pid));
      if (missingProductIds.length > 0) {
        const extraProducts = await Product.find({ _id: { $in: missingProductIds } })
          .select('categoryId')
          .lean();
        for (const ep of extraProducts) {
          productById.set(String(ep._id), ep);
        }
      }

      const resolveProdCatId = (pid: string) => {
        const prod = productById.get(pid);
        if (!prod) return '';
        return String((prod.categoryId as any)?._id || prod.categoryId || '');
      };

      for (const pid of wishlistIds) {
        addWeight(resolveProdCatId(pid), 6);
      }

      recentlyViewedEntries.forEach((pid: string, idx: number) => {
        addWeight(resolveProdCatId(pid), Math.max(1.5, 4 - idx * 0.2));
      });

      for (const pid of orderProductIds) {
        addWeight(resolveProdCatId(pid), 5);
      }
    }

    const personalized = categoryWeights.size > 0;

    const scored = candidates.map((p) => {
      const pid = String(p._id);
      const catId = String((p.categoryId as any)?._id || p.categoryId || '');
      const catName = (p.categoryId as any)?.name || '';
      const catScore = categoryWeights.get(catId) || 0;
      const ratingInfo = ratingMap.get(pid);
      const ratingScore = ratingInfo
        ? ratingInfo.avgRating * 2 + Math.min(ratingInfo.reviewCount, 20) * 0.1
        : 0;
      const stockBonus = p.stock > 5 ? 0.5 : 0.2;
      const recencyTie = p.createdAt ? new Date(p.createdAt).getTime() / 1e15 : 0;
      const isNonConsumablePurchased =
        recentlyPurchasedIds.has(pid) && !REPEAT_PURCHASE_CATEGORIES.has(catName);

      const baseScore = personalized
        ? catScore * 10 + ratingScore + stockBonus
        : ratingScore * 10 + stockBonus + recencyTie;

      const score = baseScore - (isNonConsumablePurchased ? 1000 : 0);

      return {
        product: p,
        pid,
        catId,
        catScore,
        ratingInfo,
        score
      };
    });

    scored.sort((a, b) => b.score - a.score);

    // Diversity interleaving across categories
    const groupPool = personalized
      ? scored.filter((item) => item.catScore > 0)
      : scored;

    const buckets = new Map<string, typeof scored>();
    for (const item of groupPool) {
      const key = item.catId || 'other';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    }

    const orderedBuckets = Array.from(buckets.entries())
      .sort((a, b) => {
        const wA = categoryWeights.get(a[0]) || 0;
        const wB = categoryWeights.get(b[0]) || 0;
        if (wB !== wA) return wB - wA;
        return (b[1][0]?.score || 0) - (a[1][0]?.score || 0);
      })
      .map((entry) => entry[1]);

    const picked: typeof scored = [];
    const pickedIds = new Set<string>();
    const usedImages = new Set<string>();

    let round = 0;
    while (picked.length < limit && orderedBuckets.length > 0) {
      let addedInRound = false;
      for (const bucket of orderedBuckets) {
        if (round < bucket.length && picked.length < limit) {
          const item = bucket[round];
          const img = item.product.image;
          if (!pickedIds.has(item.pid) && (!img || !usedImages.has(img))) {
            pickedIds.add(item.pid);
            if (img) usedImages.add(img);
            picked.push(item);
          }
          addedInRound = true;
        }
      }
      if (!addedInRound) break;
      round++;
    }

    // Backfill remaining slots from sorted remainder (preferring unseen images first)
    if (picked.length < limit) {
      for (const item of scored) {
        if (picked.length >= limit) break;
        const img = item.product.image;
        if (!pickedIds.has(item.pid) && (!img || !usedImages.has(img))) {
          pickedIds.add(item.pid);
          if (img) usedImages.add(img);
          picked.push(item);
        }
      }
    }

    if (picked.length < limit) {
      for (const item of scored) {
        if (picked.length >= limit) break;
        if (!pickedIds.has(item.pid)) {
          pickedIds.add(item.pid);
          picked.push(item);
        }
      }
    }

    // Resolve any missing category names for matchedCategories
    const topCategoryIds = Array.from(categoryWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((entry) => entry[0]);

    const unresolvedCatIds = topCategoryIds.filter((cid) => !categoryNameMap.has(cid));
    if (unresolvedCatIds.length > 0) {
      const catDocs = await Category.find({ _id: { $in: unresolvedCatIds } }).select('name').lean();
      for (const cd of catDocs) {
        categoryNameMap.set(String(cd._id), cd.name);
      }
    }

    const matchedCategories = topCategoryIds
      .map((cid) => categoryNameMap.get(cid))
      .filter((name): name is string => Boolean(name));

    const formatted = picked.map(({ product: p, ratingInfo }) => ({
      ...p,
      id: p._id,
      category: p.categoryId,
      rating: ratingInfo ? Number(ratingInfo.avgRating.toFixed(1)) : undefined,
      reviewCount: ratingInfo?.reviewCount || 0
    }));

    return {
      products: formatted,
      personalized,
      matchedCategories
    };
  }
};
