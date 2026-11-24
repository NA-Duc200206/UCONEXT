import { Order, Product, User } from '../models';

const NET_REVENUE_MATCH = {
  paymentStatus: 'paid',
  status: { $nin: ['cancelled', 'refund_completed'] },
};

export const analyticsService = {
  async getDashboardStats() {
    // 1. Net Revenue (paid orders excluding cancelled or refunded orders)
    const revenueResult = await Order.aggregate([
      { $match: NET_REVENUE_MATCH },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    // 2. Total Users
    const totalUsers = await User.countDocuments({ role: 'customer' });

    // 3. Total Orders
    const totalOrders = await Order.countDocuments();

    // 4. Order counts by status
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

    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    ordersByStatus.forEach((item) => {
      if (item._id in statusCounts) {
        statusCounts[item._id] = item.count;
      }
    });

    // 5. Best selling products (net of cancelled/refunded orders)
    const bestSellersAgg = await Order.aggregate([
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
    ]);

    const bestSellers = await Promise.all(
      bestSellersAgg.map(async (item) => {
        const product = await Product.findById(item._id).select('name price image');
        return {
          productId: item._id,
          totalSold: item.totalSold,
          revenue: item.revenue,
          product: product ? { name: product.name, price: product.price, image: product.image } : null,
        };
      })
    );

    // 6. Recent Orders
    const recentOrdersRaw = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('userId', 'name email');

    const recentOrders = recentOrdersRaw.map((order) => {
      const obj = order.toObject();
      return {
        ...obj,
        id: obj._id,
        user: obj.userId,
      };
    });

    // 7. Monthly Sales (net of cancelled/refunded orders)
    const salesOverTimeAgg = await Order.aggregate([
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
    ]);

    const salesOverTime = salesOverTimeAgg.map((item) => ({
      month: item._id,
      revenue: item.revenue,
      ordersCount: item.ordersCount,
    }));

    return {
      stats: {
        totalRevenue,
        totalUsers,
        totalOrders,
        statusCounts,
      },
      bestSellers,
      recentOrders,
      salesOverTime,
    };
  },
};
