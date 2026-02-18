const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const Analytics = require('../models/Analytics');

/**
 * @route   GET /api/v1/analytics/dashboard
 * @desc    Get dashboard analytics
 * @access  Private/Admin
 */
router.get('/dashboard', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;

    let startDate = new Date();
    switch (period) {
      case '24h':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '12m':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const analytics = await Analytics.find({
      date: { $gte: startDate }
    }).sort({ date: -1 });

    // Aggregate data
    const summary = {
      totalRevenue: 0,
      totalOrders: 0,
      totalDiscounts: 0,
      totalRefunds: 0,
      newCustomers: 0,
      averageOrderValue: 0
    };

    analytics.forEach(a => {
      summary.totalRevenue += a.sales?.totalRevenue || 0;
      summary.totalOrders += a.sales?.totalOrders || 0;
      summary.totalDiscounts += a.sales?.totalDiscounts || 0;
      summary.totalRefunds += a.sales?.totalRefunds || 0;
      summary.newCustomers += a.customers?.newCustomers || 0;
    });

    summary.averageOrderValue = summary.totalOrders > 0 
      ? summary.totalRevenue / summary.totalOrders 
      : 0;

    // Get today's data
    const today = await Analytics.findOne({
      dateString: new Date().toISOString().split('T')[0]
    });

    // Get yesterday's data for comparison
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayAnalytics = await Analytics.findOne({
      dateString: yesterday.toISOString().split('T')[0]
    });

    // Calculate trends
    const trends = {
      revenue: yesterdayAnalytics?.sales?.totalRevenue 
        ? ((today?.sales?.totalRevenue - yesterdayAnalytics.sales.totalRevenue) / yesterdayAnalytics.sales.totalRevenue * 100).toFixed(1)
        : 0,
      orders: yesterdayAnalytics?.sales?.totalOrders
        ? ((today?.sales?.totalOrders - yesterdayAnalytics.sales.totalOrders) / yesterdayAnalytics.sales.totalOrders * 100).toFixed(1)
        : 0
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        today: today || {},
        trends,
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/sales
 * @desc    Get sales analytics
 * @access  Private/Admin
 */
router.get('/sales', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const query = {};
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const analytics = await Analytics.find(query).sort({ date: -1 });

    // Group by period
    const grouped = {};
    analytics.forEach(a => {
      let key;
      if (groupBy === 'hour') {
        key = a.dateString + ' ' + a.date.getHours() + ':00';
      } else if (groupBy === 'month') {
        key = a.dateString.substring(0, 7);
      } else {
        key = a.dateString;
      }

      if (!grouped[key]) {
        grouped[key] = {
          date: key,
          revenue: 0,
          orders: 0,
          discounts: 0
        };
      }

      grouped[key].revenue += a.sales?.totalRevenue || 0;
      grouped[key].orders += a.sales?.totalOrders || 0;
      grouped[key].discounts += a.sales?.totalDiscounts || 0;
    });

    res.status(200).json({
      success: true,
      data: Object.values(grouped).reverse()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/customers
 * @desc    Get customer analytics
 * @access  Private/Admin
 */
router.get('/customers', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;

    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '12m':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const analytics = await Analytics.find({
      date: { $gte: startDate }
    }).sort({ date: -1 });

    const summary = {
      newCustomers: 0,
      returningCustomers: 0,
      totalActiveCustomers: 0,
      averageLifetimeValue: 0
    };

    analytics.forEach(a => {
      summary.newCustomers += a.customers?.newCustomers || 0;
      summary.returningCustomers += a.customers?.returningCustomers || 0;
      summary.totalActiveCustomers = a.customers?.totalActiveCustomers || 0;
    });

    // Get user statistics
    const User = require('../models/User');
    const totalUsers = await User.countDocuments();
    const newUsersLastMonth = await User.countDocuments({
      createdAt: { $gte: startDate }
    });

    res.status(200).json({
      success: true,
      data: {
        ...summary,
        totalUsers,
        newUsersLastMonth,
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/products
 * @desc    Get product analytics
 * @access  Private/Admin
 */
router.get('/products', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { period = '30d', limit = 10 } = req.query;

    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const analytics = await Analytics.find({
      date: { $gte: startDate }
    }).sort({ date: -1 });

    // Aggregate top products
    const productSales = {};
    analytics.forEach(a => {
      if (a.products?.topSellingProducts) {
        a.products.topSellingProducts.forEach(p => {
          const productId = p.product.toString();
          if (!productSales[productId]) {
            productSales[productId] = {
              product: p.product,
              quantitySold: 0,
              revenue: 0
            };
          }
          productSales[productId].quantitySold += p.quantitySold || 0;
          productSales[productId].revenue += p.revenue || 0;
        });
      }
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, parseInt(limit));

    // Get Product details
    const Product = require('../models/Product');
    const productIds = topProducts.map(p => p.product);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('name price images sku');

    const topProductsWithDetails = topProducts.map(p => {
      const product = products.find(prod => prod._id.toString() === p.product.toString());
      return {
        ...p,
        product
      };
    });

    // Get stock status
    const lowStock = await Product.countDocuments({
      stock: { $gt: 0, $lte: 10 }
    });
    const outOfStock = await Product.countDocuments({ stock: 0 });

    res.status(200).json({
      success: true,
      data: {
        topProducts: topProductsWithDetails,
        stockStatus: {
          lowStock,
          outOfStock
        },
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/traffic
 * @desc    Get traffic analytics
 * @access  Private/Admin
 */
router.get('/traffic', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;

    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const analytics = await Analytics.find({
      date: { $gte: startDate }
    }).sort({ date: -1 });

    const summary = {
      totalVisits: 0,
      uniqueVisitors: 0,
      pageViews: 0,
      bounceRate: 0,
      sources: {
        direct: 0,
        organic: 0,
        social: 0,
        email: 0,
        referral: 0,
        paid: 0
      },
      devices: {
        desktop: 0,
        mobile: 0,
        tablet: 0
      }
    };

    analytics.forEach(a => {
      summary.totalVisits += a.traffic?.totalVisits || 0;
      summary.uniqueVisitors += a.traffic?.uniqueVisitors || 0;
      summary.pageViews += a.traffic?.pageViews || 0;
      
      if (a.traffic?.sources) {
        Object.keys(summary.sources).forEach(key => {
          summary.sources[key] += a.traffic.sources[key] || 0;
        });
      }

      if (a.traffic?.devices) {
        Object.keys(summary.devices).forEach(key => {
          summary.devices[key] += a.traffic.devices[key] || 0;
        });
      }
    });

    summary.bounceRate = analytics.length > 0
      ? analytics.reduce((sum, a) => sum + (a.traffic?.bounceRate || 0), 0) / analytics.length
      : 0;

    res.status(200).json({
      success: true,
      data: {
        ...summary,
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/conversions
 * @desc    Get conversion analytics
 * @access  Private/Admin
 */
router.get('/conversions', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;

    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const analytics = await Analytics.find({
      date: { $gte: startDate }
    }).sort({ date: -1 });

    const summary = {
      conversionRate: 0,
      cartAbandonmentRate: 0,
      checkoutAbandonmentRate: 0,
      addToCartEvents: 0,
      checkoutInitiated: 0,
      ordersCompleted: 0
    };

    analytics.forEach(a => {
      if (a.conversion) {
        summary.conversionRate += a.conversion.conversionRate || 0;
        summary.cartAbandonmentRate += a.conversion.cartAbandonmentRate || 0;
        summary.checkoutAbandonmentRate += a.conversion.checkoutAbandonmentRate || 0;
        summary.addToCartEvents += a.conversion.addToCartEvents || 0;
        summary.checkoutInitiated += a.conversion.checkoutInitiated || 0;
        summary.ordersCompleted += a.conversion.ordersCompleted || 0;
      }
    });

    // Calculate averages
    const count = analytics.length || 1;
    summary.conversionRate = (summary.conversionRate / count).toFixed(2);
    summary.cartAbandonmentRate = (summary.cartAbandonmentRate / count).toFixed(2);
    summary.checkoutAbandonmentRate = (summary.checkoutAbandonmentRate / count).toFixed(2);

    res.status(200).json({
      success: true,
      data: {
        ...summary,
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/analytics/geographic
 * @desc    Get geographic analytics
 * @access  Private/Admin
 */
router.get('/geographic', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;

    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '12m':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const analytics = await Analytics.find({
      date: { $gte: startDate }
    }).sort({ date: -1 });

    // Aggregate by state
    const stateData = {};
    analytics.forEach(a => {
      if (a.geographic) {
        a.geographic.forEach(g => {
          if (!stateData[g.state]) {
            stateData[g.state] = {
              state: g.state,
              orderCount: 0,
              revenue: 0,
              averageOrderValue: 0
            };
          }
          stateData[g.state].orderCount += g.orderCount || 0;
          stateData[g.state].revenue += g.revenue || 0;
        });
      }
    });

    // Calculate averages
    Object.values(stateData).forEach(s => {
      s.averageOrderValue = s.orderCount > 0 ? s.revenue / s.orderCount : 0;
    });

    const sortedData = Object.values(stateData)
      .sort((a, b) => b.revenue - a.revenue);

    res.status(200).json({
      success: true,
      data: {
        byState: sortedData,
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/analytics/generate
 * @desc    Generate analytics for a specific date (admin)
 * @access  Private/Admin
 */
router.post(
  '/generate',
  protect,
  authorize('admin'),
  [
    query('date').optional().isISO8601(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date) : new Date();

      const analytics = await Analytics.generateDailyAnalytics(targetDate);

      res.status(200).json({
        success: true,
        message: 'Analytics generated successfully',
        data: analytics
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/analytics/realtime
 * @desc    Get real-time analytics (simplified)
 * @access  Private/Admin
 */
router.get('/realtime', protect, authorize('admin'), async (req, res, next) => {
  try {
    const Order = require('../models/Order');
    const User = require('../models/User');
    const Product = require('../models/Product');

    // Get today's orders
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = await Order.find({
      createdAt: { $gte: today }
    });

    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const todayOrdersCount = todayOrders.length;

    // Get active users (last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Get low stock count
    const lowStockCount = await Product.countDocuments({
      stock: { $gt: 0, $lte: 10 }
    });

    res.status(200).json({
      success: true,
      data: {
        todayRevenue,
        todayOrdersCount,
        averageOrderValue: todayOrdersCount > 0 ? todayRevenue / todayOrdersCount : 0,
        lowStockAlerts: lowStockCount,
        timestamp: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

