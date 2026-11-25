import { Order, Product, User } from '../models';
import { cacheService } from '../utils/cache';

const DASHBOARD_CACHE_KEY = 'cache:analytics:dashboard';

const NET_REVENUE_MATCH = {
  paymentStatus: 'paid',
  status: { $nin: ['cancelled', 'refund_completed'] },
};

export const analyticsService = {
  async getDashboardStats() {
    const cached = await cacheService.get<any>(DASHBOARD_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const [
      revenueResult,
      totalUsers,
      totalOrders,
      totalProducts,
      lowStockCount,
      ordersByStatus,
      bestSellersAgg,
      recentOrdersRaw,
      salesOverTimeAgg,
    ] = await Promise.all([
      Order.aggregate([
        { $match: NET_REVENUE_MATCH },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      User.countDocuments({ role: 'customer' }),
      Order.countDocuments(),
      Product.countDocuments({ isDeleted: { $ne: true } }),
      Product.countDocuments({ isDeleted: { $ne: true }, stock: { $lte: 10 } }),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: NET_REVENUE_MATCH },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            totalSold: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
      ]),
      Order.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'name email'),
      Order.aggregate([
        { $match: NET_REVENUE_MATCH },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            revenue: { $sum: '$totalAmount' },
            ordersCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 6 },
      ]),
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    const statusCounts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      packaging: 0,
      paid: 0,
      shipping: 0,
      delivered: 0,
      completed: 0,
      cancelled: 0,
      refund_requested: 0,
      refund_completed: 0,
    };

    ordersByStatus.forEach((item) => {
      if (item._id in statusCounts) {
        statusCounts[item._id] = item.count;
      }
    });

    const bestSellerIds = bestSellersAgg.map((item) => item._id);
    const bestSellerProducts =
      bestSellerIds.length > 0
        ? await Product.find({ _id: { $in: bestSellerIds } }).select('name price image')
        : [];
    const bestSellerMap = new Map(bestSellerProducts.map((p) => [String(p._id), p]));

    const bestSellers = bestSellersAgg.map((item) => {
      const product = bestSellerMap.get(String(item._id));
      return {
        productId: item._id,
        totalSold: item.totalSold,
        revenue: item.revenue,
        product: product ? { name: product.name, price: product.price, image: product.image } : null,
      };
    });

    const recentOrders = recentOrdersRaw.map((order) => {
      const obj = order.toObject();
      return {
        ...obj,
        id: obj._id,
        user: obj.userId,
      };
    });

    const salesOverTime = salesOverTimeAgg.map((item) => ({
      month: item._id,
      revenue: item.revenue,
      ordersCount: item.ordersCount,
    }));

    const payload = {
      stats: {
        totalRevenue,
        totalUsers,
        totalOrders,
        totalProducts,
        lowStockCount,
        statusCounts,
      },
      bestSellers,
      recentOrders,
      salesOverTime,
    };

    await cacheService.set(DASHBOARD_CACHE_KEY, payload, 45);
    return payload;
  },
};
