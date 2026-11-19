import mongoose from 'mongoose';
import { Product, Category, Order, Review } from '../models';

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
  page?: string | number;
  limit?: string | number;
  sort?: string;
}

export const productService = {
  async getAll(params: ProductQueryParams) {
    const { search, categoryId, minPrice, maxPrice, page = '1', limit = '9', sort } = params;

    const query: any = {};

    if (search) {
      query.name = { $regex: search.toString(), $options: 'i' };
    }

    const pageNum = parseInt(page.toString()) || 1;
    const limitNum = parseInt(limit.toString()) || 9;

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

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice.toString());
      if (maxPrice) query.price.$lte = parseFloat(maxPrice.toString());
    }

    let sortOption: any = { createdAt: -1 };
    if (sort) {
      if (sort === 'price_asc') sortOption = { price: 1 };
      else if (sort === 'price_desc') sortOption = { price: -1 };
      else if (sort === 'name_asc') sortOption = { name: 1 };
      else if (sort === 'name_desc') sortOption = { name: -1 };
    }

    const skip = (pageNum - 1) * limitNum;

    const [products, totalProducts] = await Promise.all([
      Product.find(query)
        .populate('categoryId', 'name slug')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum),
      Product.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalProducts / limitNum);

    const formattedProducts = products.map(p => {
      const obj = p.toObject();
      return {
        ...obj,
        id: obj._id,
        category: obj.categoryId
      };
    });

    return {
      products: formattedProducts,
      totalProducts,
      totalPages,
      currentPage: pageNum,
      limit: limitNum
    };
  },

  async getById(id: string) {
    const product = await Product.findById(id).populate('categoryId', 'name slug');
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

  async create(data: {
    name: string;
    price: number;
    stock: number;
    description?: string;
    image?: string;
    options?: any;
    categoryId: string;
  }) {
    const { name, price, stock, description, image, options, categoryId } = data;

    if (!name || price === undefined || stock === undefined || !categoryId) {
      const error: any = new Error('Please provide all required fields.');
      error.statusCode = 400;
      throw error;
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      const error: any = new Error('Invalid category.');
      error.statusCode = 400;
      throw error;
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const product = await Product.create({
      name,
      slug,
      price,
      stock,
      description,
      image,
      options: options || { colors: [], sizes: [] },
      categoryId: categoryId as any
    });

    return product;
  },

  async update(id: string, data: any) {
    const product = await Product.findById(id);
    if (!product) {
      const error: any = new Error('Product does not exist.');
      error.statusCode = 404;
      throw error;
    }

    if (data.categoryId) {
      const category = await Category.findById(data.categoryId);
      if (!category) {
        const error: any = new Error('Invalid category.');
        error.statusCode = 400;
        throw error;
      }
      product.categoryId = data.categoryId;
    }

    if (data.name) {
      product.name = data.name;
      product.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    }
    if (data.price !== undefined) product.price = data.price;
    if (data.stock !== undefined) product.stock = data.stock;
    if (data.description !== undefined) product.description = data.description;
    if (data.image !== undefined) product.image = data.image;
    if (data.options !== undefined) product.options = data.options;

    await product.save();
    return product;
  },

  async delete(id: string) {
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      const error: any = new Error('Product does not exist.');
      error.statusCode = 404;
      throw error;
    }
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
