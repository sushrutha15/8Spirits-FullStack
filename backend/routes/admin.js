const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');

const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Analytics = require('../models/Analytics');
const { Category, Review } = require('../models/index');

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard statistics
 * @access  Private/Admin
 */
router.get('/dashboard', protect, authorize('admin'), async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get counts
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      todayOrders,
      todayRevenue,
      pendingOrders,
      lowStockProducts,
      newUsers,
      recentOrders
    ] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments({ isActive: true }),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: today }, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Order.countDocuments({ orderStatus: 'pending' }),
      Product.countDocuments({ stock: { $gt: 0, $lte: 10 } }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Order.find()
        .sort('-createdAt')
        .limit(10)
        .populate('user', 'firstName lastName email')
        .select('orderNumber total orderStatus createdAt')
    ]);

    // Get revenue trend (last 7 days)
    const revenueTrend = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Top selling products
    const topProducts = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          image: { $arrayElemAt: ['$product.images.url', 0] },
          totalSold: 1,
          revenue: 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          todayOrders,
          todayRevenue: todayRevenue[0]?.total || 0,
          pendingOrders,
          lowStockProducts,
          newUsers
        },
        revenueTrend,
        topProducts,
        recentOrders
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with filters
 * @access  Private/Admin
 */
router.get('/users', protect, authorize('admin'), async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      search,
      isActive,
      loyaltyTier,
      sort = '-createdAt'
    } = req.query;

    const query = {};

    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (loyaltyTier) query.loyaltyTier = loyaltyTier;
    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshToken')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: { users }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user (admin)
 * @access  Private/Admin
 */
router.put('/users/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { role, isActive, loyaltyTier, loyaltyPoints } = req.body;

    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (loyaltyTier) user.loyaltyTier = loyaltyTier;
    if (loyaltyPoints !== undefined) user.loyaltyPoints = loyaltyPoints;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete user
 * @access  Private/Admin
 */
router.delete('/users/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has orders
    const orderCount = await Order.countDocuments({ user: user._id });
    
    if (orderCount > 0) {
      // Soft delete - deactivate instead
      user.isActive = false;
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'User deactivated (has order history)'
      });
    }

    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/orders
 * @desc    Get all orders with advanced filters
 * @access  Private/Admin
 */
router.get('/orders', protect, authorize('admin'), async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      search,
      sort = '-createdAt'
    } = req.query;

    const query = {};

    if (status) query.orderStatus = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    if (minAmount || maxAmount) {
      query.total = {};
      if (minAmount) query.total.$gte = Number(minAmount);
      if (maxAmount) query.total.$lte = Number(maxAmount);
    }

    if (search) {
      query.$or = [
        { orderNumber: new RegExp(search, 'i') },
        { 'customerInfo.email': new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: { orders }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/orders/:id/status
 * @desc    Update order status
 * @access  Private/Admin
 */
router.put(
  '/orders/:id/status',
  protect,
  authorize('admin'),
  [
    body('status').notEmpty().withMessage('Status is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { status, trackingNumber, notes } = req.body;

      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Update status
      order.orderStatus = status;
      if (trackingNumber) order.trackingNumber = trackingNumber;
      if (notes) order.adminNotes = notes;

      // Update dates based on status
      if (status === 'paid') order.paidAt = Date.now();
      if (status === 'processing') order.processedAt = Date.now();
      if (status === 'shipped') order.shippedAt = Date.now();
      if (status === 'delivered') order.deliveredAt = Date.now();

      // Add to status history
      order.addStatusHistory(status, notes, req.user.id);

      await order.save();

      // Send notification to customer
      // TODO: Implement notification

      res.status(200).json({
        success: true,
        message: 'Order status updated',
        data: { order }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/admin/products/inventory
 * @desc    Get inventory report
 * @access  Private/Admin
 */
router.get('/products/inventory', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { status = 'all' } = req.query;

    let query = { isActive: true };

    if (status === 'low') {
      query.stock = { $gt: 0, $lte: 10 };
    } else if (status === 'out') {
      query.stock = 0;
    } else if (status === 'in') {
      query.stock = { $gt: 10 };
    }

    const products = await Product.find(query)
      .select('name sku stock lowStockThreshold price costPrice')
      .sort('stock name');

    const summary = {
      totalProducts: await Product.countDocuments({ isActive: true }),
      inStock: await Product.countDocuments({ isActive: true, stock: { $gt: 10 } }),
      lowStock: await Product.countDocuments({ isActive: true, stock: { $gt: 0, $lte: 10 } }),
      outOfStock: await Product.countDocuments({ isActive: true, stock: 0 }),
      totalStockValue: await Product.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            value: { $sum: { $multiply: ['$stock', '$costPrice'] } }
          }
        }
      ])
    };

    res.status(200).json({
      success: true,
      data: {
        summary: {
          ...summary,
          totalStockValue: summary.totalStockValue[0]?.value || 0
        },
        products
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/analytics/revenue
 * @desc    Get revenue analytics
 * @access  Private/Admin
 */
router.get('/analytics/revenue', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { period = 'month', year, month } = req.query;

    let dateQuery = {};
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    if (period === 'year') {
      dateQuery = {
        createdAt: {
          $gte: new Date(`${currentYear}-01-01`),
          $lte: new Date(`${currentYear}-12-31`)
        }
      };
    } else if (period === 'month') {
      dateQuery = {
        createdAt: {
          $gte: new Date(`${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`),
          $lte: new Date(`${currentYear}-${currentMonth.toString().padStart(2, '0')}-31`)
        }
      };
    }

    const revenueData = await Order.aggregate([
      { $match: { ...dateQuery, paymentStatus: 'paid' } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === 'year' ? '%Y-%m' : '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
          averageOrderValue: { $avg: '$total' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get total summary
    const summary = await Order.aggregate([
      { $match: { ...dateQuery, paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$total' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        summary: summary[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 },
        data: revenueData
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/reviews/pending
 * @desc    Get pending reviews
 * @access  Private/Admin
 */
router.get('/reviews/pending', protect, authorize('admin'), async (req, res, next) => {
  try {
    const reviews = await Review.find({ isApproved: false })
      .populate('user', 'firstName lastName email')
      .populate('product', 'name slug images')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: { reviews }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/reviews/:id/approve
 * @desc    Approve/reject review
 * @access  Private/Admin
 */
router.put(
  '/reviews/:id/approve',
  protect,
  authorize('admin'),
  [
    body('isApproved').isBoolean().withMessage('isApproved must be boolean'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { isApproved } = req.body;

      const review = await Review.findById(req.params.id);

      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found'
        });
      }

      review.isApproved = isApproved;
      await review.save();

      // Update product rating
      const product = await Product.findById(review.product);
      if (product) {
        await product.updateRating();
      }

      res.status(200).json({
        success: true,
        message: `Review ${isApproved ? 'approved' : 'rejected'}`,
        data: { review }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/admin/products/bulk-update
 * @desc    Bulk update products
 * @access  Private/Admin
 */
router.post(
  '/products/bulk-update',
  protect,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { productIds, updates } = req.body;

      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Product IDs array is required'
        });
      }

      const result = await Product.updateMany(
        { _id: { $in: productIds } },
        { $set: updates }
      );

      res.status(200).json({
        success: true,
        message: `${result.modifiedCount} products updated`,
        data: {
          matched: result.matchedCount,
          modified: result.modifiedCount
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/admin/analytics/customers
 * @desc    Get customer analytics
 * @access  Private/Admin
 */
router.get('/analytics/customers', protect, authorize('admin'), async (req, res, next) => {
  try {
    const totalCustomers = await User.countDocuments({ role: 'user' });
    const activeCustomers = await User.countDocuments({ role: 'user', isActive: true });

    // Loyalty tier distribution
    const loyaltyDistribution = await User.aggregate([
      { $match: { role: 'user' } },
      { $group: { _id: '$loyaltyTier', count: { $sum: 1 } } }
    ]);

    // Top customers by spending
    const topCustomers = await User.find({ role: 'user' })
      .sort('-totalSpent')
      .limit(10)
      .select('firstName lastName email totalSpent totalOrders');

    // New customers trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newCustomersTrend = await User.aggregate([
      {
        $match: {
          role: 'user',
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCustomers,
          activeCustomers,
          inactiveCustomers: totalCustomers - activeCustomers
        },
        loyaltyDistribution,
        topCustomers,
        newCustomersTrend
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;