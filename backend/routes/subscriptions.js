const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const Subscription = require('../models/Subscription');

/**
 * @route   GET /api/v1/subscriptions
 * @desc    Get current user's subscriptions
 * @access  Private
 */
router.get('/', protect, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = { user: req.user.id };
    if (status) {
      query.status = status;
    }

    const subscriptions = await Subscription.find(query)
      .populate('items.product', 'name price images slug')
      .populate('appliedCoupon', 'code discountType discountValue')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Subscription.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/subscriptions/:id
 * @desc    Get single subscription
 * @access  Private
 */
router.get(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Valid subscription ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const subscription = await Subscription.findOne({
        _id: req.params.id,
        user: req.user.id
      })
        .populate('items.product', 'name price images slug description')
        .populate('orders')
        .populate('appliedCoupon');

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      res.status(200).json({
        success: true,
        data: subscription
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/subscriptions
 * @desc    Create a new subscription
 * @access  Private
 */
router.post(
  '/',
  protect,
  [
    body('name').notEmpty().withMessage('Subscription name is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.product').isMongoId().withMessage('Valid product ID is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('frequency').isIn(['daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannually', 'annually']).withMessage('Valid frequency is required'),
    body('billingAddress').isObject().withMessage('Billing address is required'),
    body('billingAddress.firstName').notEmpty(),
    body('billingAddress.address1').notEmpty(),
    body('billingAddress.city').notEmpty(),
    body('billingAddress.state').notEmpty(),
    body('billingAddress.zipCode').notEmpty(),
    body('billingAddress.country').notEmpty(),
    body('shippingAddress').optional().isObject(),
    body('paymentMethodId').notEmpty().withMessage('Payment method is required'),
    body('couponCode').optional(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { name, items, frequency, billingAddress, shippingAddress, paymentMethodId, couponCode, preferences } = req.body;

      // Get product details and calculate totals
      const Product = require('../models/Product');
      let subtotal = 0;
      const subscriptionItems = [];

      for (const item of items) {
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(404).json({
            success: false,
            message: `Product ${item.product} not found`
          });
        }

        const itemPrice = product.price;
        subscriptionItems.push({
          product: product._id,
          variant: item.variant,
          quantity: item.quantity,
          price: itemPrice
        });

        subtotal += itemPrice * item.quantity;
      }

      // Apply coupon if provided
      let discount = 0;
      let appliedCoupon = null;
      if (couponCode) {
        const Coupon = require('../models/Coupon');
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        if (coupon) {
          const validation = coupon.isValid();
          if (validation.valid) {
            discount = coupon.calculateDiscount({ subtotal });
            appliedCoupon = coupon._id;
          }
        }
      }

      // Calculate next billing date
      const nextBillingDate = new Date();
      switch (frequency) {
        case 'daily': nextBillingDate.setDate(nextBillingDate.getDate() + 1); break;
        case 'weekly': nextBillingDate.setDate(nextBillingDate.getDate() + 7); break;
        case 'biweekly': nextBillingDate.setDate(nextBillingDate.getDate() + 14); break;
        case 'monthly': nextBillingDate.setMonth(nextBillingDate.getMonth() + 1); break;
        case 'bimonthly': nextBillingDate.setMonth(nextBillingDate.getMonth() + 2); break;
        case 'quarterly': nextBillingDate.setMonth(nextBillingDate.getMonth() + 3); break;
        case 'semiannually': nextBillingDate.setMonth(nextBillingDate.getMonth() + 6); break;
        case 'annually': nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1); break;
      }

      // Calculate tax and shipping (simplified)
      const tax = subtotal * 0.08; // 8% tax
      const shippingCost = 9.99;
      const total = subtotal + tax + shippingCost - discount;

      // Get Stripe customer and subscription
      const User = require('../models/User');
      const user = await User.findById(req.user.id);
      
      let stripeCustomerId = user.stripeCustomerId;
      let stripeSubscriptionId = null;

      // Create Stripe subscription if needed
      if (process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            metadata: { userId: user._id.toString() }
          });
          stripeCustomerId = customer.id;
          user.stripeCustomerId = stripeCustomerId;
          await user.save();
        }

        // Create subscription (simplified - in production would create proper Stripe subscription)
        stripeSubscriptionId = `sub_${Date.now()}`;
      }

      const subscription = await Subscription.create({
        user: req.user.id,
        name,
        items: subscriptionItems,
        frequency,
        nextBillingDate,
        billingAddress,
        shippingAddress: shippingAddress || billingAddress,
        paymentMethod: 'stripe',
        stripeCustomerId,
        stripeSubscriptionId,
        paymentMethodId,
        subtotal,
        tax,
        shippingCost,
        discount,
        total,
        appliedCoupon,
        preferences: preferences || {
          autoRenew: true,
          sendReminders: true,
          reminderDaysBefore: 3,
          allowSubstitutions: false,
          notifyOnShipment: true
        },
        source: 'web'
      });

      await subscription.populate('items.product', 'name price images slug');
      await subscription.populate('appliedCoupon');

      res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        data: subscription
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/subscriptions/:id
 * @desc    Update subscription (pause, resume, modify items)
 * @access  Private
 */
router.put(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Valid subscription ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const subscription = await Subscription.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      const { name, items, frequency, billingAddress, shippingAddress, preferences } = req.body;

      // Track modifications
      const modifications = [];

      if (name && name !== subscription.name) {
        subscription.name = name;
        modifications.push('name');
      }

      if (items) {
        // Recalculate totals
        const Product = require('../models/Product');
        let subtotal = 0;

        for (const item of items) {
          const product = await Product.findById(item.product);
          if (product) {
            subtotal += product.price * item.quantity;
          }
        }

        subscription.items = items;
        subscription.subtotal = subtotal;
        subscription.total = subtotal + subscription.tax + subscription.shippingCost - subscription.discount;
        modifications.push('items');
      }

      if (frequency && frequency !== subscription.frequency) {
        subscription.frequency = frequency;
        subscription.nextBillingDate = subscription.calculateNextBillingDate();
        modifications.push('frequency');
      }

      if (billingAddress) {
        subscription.billingAddress = billingAddress;
        modifications.push('billingAddress');
      }

      if (shippingAddress) {
        subscription.shippingAddress = shippingAddress;
        modifications.push('shippingAddress');
      }

      if (preferences) {
        subscription.preferences = { ...subscription.preferences, ...preferences };
        modifications.push('preferences');
      }

      // Add modification to history
      subscription.modificationsHistory.push({
        modifiedAt: Date.now(),
        modifiedBy: req.user.id,
        changes: modifications,
        reason: req.body.reason || 'User update'
      });

      await subscription.save();
      await subscription.populate('items.product', 'name price images slug');

      res.status(200).json({
        success: true,
        message: 'Subscription updated successfully',
        data: subscription
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/subscriptions/:id/pause
 * @desc    Pause subscription
 * @access  Private
 */
router.post(
  '/:id/pause',
  protect,
  [
    param('id').isMongoId().withMessage('Valid subscription ID is required'),
    body('duration').optional().isInt({ min: 1, max: 90 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const { duration = 30 } = req.body;

      const subscription = await Subscription.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      if (subscription.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Only active subscriptions can be paused'
        });
      }

      await subscription.pause(duration);

      res.status(200).json({
        success: true,
        message: `Subscription paused for ${duration} days`,
        data: subscription
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/subscriptions/:id/resume
 * @desc    Resume paused subscription
 * @access  Private
 */
router.post(
  '/:id/resume',
  protect,
  [
    param('id').isMongoId().withMessage('Valid subscription ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const subscription = await Subscription.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      if (subscription.status !== 'paused') {
        return res.status(400).json({
          success: false,
          message: 'Only paused subscriptions can be resumed'
        });
      }

      await subscription.resume();

      res.status(200).json({
        success: true,
        message: 'Subscription resumed successfully',
        data: subscription
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/subscriptions/:id/cancel
 * @desc    Cancel subscription
 * @access  Private
 */
router.post(
  '/:id/cancel',
  protect,
  [
    param('id').isMongoId().withMessage('Valid subscription ID is required'),
    body('reason').optional(),
    body('feedback').optional(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { reason, feedback } = req.body;

      const subscription = await Subscription.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      if (subscription.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          message: 'Subscription is already cancelled'
        });
      }

      await subscription.cancel(reason, req.user.id);

      if (feedback) {
        subscription.cancellationFeedback = feedback;
        await subscription.save();
      }

      res.status(200).json({
        success: true,
        message: 'Subscription cancelled successfully',
        data: subscription
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/subscriptions/:id/skip
 * @desc    Skip next order
 * @access  Private
 */
router.post(
  '/:id/skip',
  protect,
  [
    param('id').isMongoId().withMessage('Valid subscription ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const subscription = await Subscription.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      if (subscription.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Only active subscriptions can skip orders'
        });
      }

      subscription.skipNextOrder = true;
      subscription.nextBillingDate = subscription.calculateNextBillingDate();
      await subscription.save();

      res.status(200).json({
        success: true,
        message: 'Next order skipped',
        data: subscription
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/subscriptions/:id/process-billing
 * @desc    Process subscription billing (usually called by cron job)
 * @access  Private/Admin
 */
router.post(
  '/:id/process-billing',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid subscription ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const subscription = await Subscription.findById(req.params.id);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      const result = await subscription.processBilling();

      res.status(200).json({
        success: result.success,
        message: result.success ? 'Billing processed successfully' : 'Billing failed',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

// Admin routes

/**
 * @route   GET /api/v1/subscriptions/admin/all
 * @desc    Get all subscriptions (admin)
 * @access  Private/Admin
 */
router.get('/admin/all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50, search } = req.query;

    const query = {};
    if (status) query.status = status;

    const subscriptions = await Subscription.find(query)
      .populate('user', 'firstName lastName email phone')
      .populate('items.product', 'name price')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Subscription.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/subscriptions/admin/stats
 * @desc    Get subscription statistics (admin)
 * @access  Private/Admin
 */
router.get('/admin/stats', protect, authorize('admin'), async (req, res, next) => {
  try {
    const stats = await Subscription.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const totalActive = await Subscription.countDocuments({ status: 'active' });
    const totalMRR = await Subscription.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const upcomingBillings = await Subscription.find({
      status: 'active',
      nextBillingDate: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    }).populate('user', 'firstName lastName email');

    res.status(200).json({
      success: true,
      data: {
        byStatus: stats,
        totalActive,
        monthlyRecurringRevenue: totalMRR[0]?.total || 0,
        upcomingBillingsCount: upcomingBillings.length,
        upcomingBillings
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

