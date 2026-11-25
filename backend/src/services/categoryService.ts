import { Types } from 'mongoose';
import { Category, Product } from '../models';
import { cacheService, toSlug } from '../utils/cache';
import { auditService } from './auditService';

const CATEGORIES_CACHE_KEY = 'cache:categories:all';

function createCategoryError(message: string, statusCode = 400) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export const categoryService = {
  async getAll() {
    const cached = await cacheService.get<any[]>(CATEGORIES_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const [categories, productCounts] = await Promise.all([
      Category.find().sort({ name: 1 }),
      Product.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$categoryId', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map<string, number>(
      productCounts.map((row: any) => [String(row._id), Number(row.count) || 0])
    );

    const formatted = categories.map((c) => {
      const obj = c.toObject();
      const idStr = String(obj._id);
      return {
        ...obj,
        id: obj._id,
        productCount: countMap.get(idStr) || 0,
      };
    });

    await cacheService.set(CATEGORIES_CACHE_KEY, formatted, 120);
    return formatted;
  },

  async create(name: string, description?: string, actorId?: string, ipAddress?: string) {
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) {
      throw createCategoryError('Category name is required.', 400);
    }

    const slug = toSlug(cleanName);
    if (!slug) {
      throw createCategoryError('Category name must contain valid alphanumeric characters.', 400);
    }

    const existing = await Category.findOne({
      $or: [{ slug }, { name: cleanName }],
    });
    if (existing) {
      throw createCategoryError('A category with this name or slug already exists.', 400);
    }

    const category = await Category.create({
      name: cleanName,
      slug,
      description: typeof description === 'string' ? description.trim() : undefined,
    });

    await cacheService.invalidateByPrefix('cache:categories:', 'cache:products:');
    await auditService.record({
      userId: actorId,
      action: 'CATEGORY_CREATE',
      targetType: 'Category',
      targetId: String(category._id),
      newValue: { name: category.name, slug: category.slug, description: category.description },
      ipAddress,
    });

    const obj = category.toObject();
    return {
      ...obj,
      id: obj._id,
      productCount: 0,
    };
  },

  async update(id: string, name?: string, description?: string, actorId?: string, ipAddress?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw createCategoryError('Category not found.', 404);
    }

    const category = await Category.findById(id);
    if (!category) {
      throw createCategoryError('Category not found.', 404);
    }

    const oldSnapshot = {
      name: category.name,
      slug: category.slug,
      description: category.description,
    };

    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        throw createCategoryError('Category name cannot be empty.', 400);
      }
      const nextSlug = toSlug(cleanName);
      if (!nextSlug) {
        throw createCategoryError('Category name must contain valid alphanumeric characters.', 400);
      }
      const conflict = await Category.findOne({
        _id: { $ne: category._id } as any,
        $or: [{ slug: nextSlug }, { name: cleanName }],
      });
      if (conflict) {
        throw createCategoryError('Another category already uses this name or slug.', 400);
      }
      category.name = cleanName;
      category.slug = nextSlug;
    }

    if (description !== undefined) {
      category.description = typeof description === 'string' ? description.trim() : '';
    }

    await category.save();
    await cacheService.invalidateByPrefix('cache:categories:', 'cache:products:');
    await auditService.record({
      userId: actorId,
      action: 'CATEGORY_UPDATE',
      targetType: 'Category',
      targetId: String(category._id),
      oldValue: oldSnapshot,
      newValue: { name: category.name, slug: category.slug, description: category.description },
      ipAddress,
    });

    const obj = category.toObject();
    return {
      ...obj,
      id: obj._id,
    };
  },

  async delete(id: string, actorId?: string, ipAddress?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw createCategoryError('Category not found.', 404);
    }

    const category = await Category.findById(id);
    if (!category) {
      throw createCategoryError('Category not found.', 404);
    }

    const activeProductsCount = await Product.countDocuments({
      categoryId: category._id as any,
      isDeleted: { $ne: true },
    });

    if (activeProductsCount > 0) {
      throw createCategoryError(
        `Cannot delete category "${category.name}" while it contains ${activeProductsCount} active product(s).`,
        400
      );
    }

    const deletedSnapshot = { name: category.name, slug: category.slug };
    await Category.findByIdAndDelete(id);

    await cacheService.invalidateByPrefix('cache:categories:', 'cache:products:');
    await auditService.record({
      userId: actorId,
      action: 'CATEGORY_DELETE',
      targetType: 'Category',
      targetId: String(id),
      oldValue: deletedSnapshot,
      ipAddress,
    });

    return true;
  },
};
