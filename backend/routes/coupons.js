const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');

/**
 * @route   GET /api/v1/coupons
 * @desc    Get all valid coupons (public - for customers)
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const coupons = await Coupon.find({
      isActive: true,
      isPublic: true,
      startDate: { $lte: new Date() },
      $or: [
        { endDate: { $gte: new Date() } },
        { endDate: { $exists: false } }
      ]
    })
      .select('code name description discountType discountValue maxDiscountAmount minimumPurchaseAmount startDate endDate')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Coupon.countDocuments({
      isActive: true,
      isPublic: true,
      startDate: { $lte: new Date() },
      $or: [
        { endDate: { $gte: new Date() } },
        { endDate: { $exists: false } }
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        coupons,
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
 * @route   GET /api/v1/coupons/validate
 * @desc    Validate a coupon code
 * @access  Public
 */
router.post(
  '/validate',
  [
    body('code').notEmpty().withMessage('Coupon code is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { code, cart } = req.body;

      const coupon = await Coupon.findOne({ code: code.toUpperCase() });

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Invalid coupon code'
        });
      }

      // If user is logged in, check user-specific validity
      let userId = null;
      if (req.headers.authorization) {
        try {
          const { protect } = require('../middleware/auth');
          // User validation would happen here if token is valid
        } catch (e) {
          // Continue without user validation
        }
      }

      const validation = coupon.isValid();

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.reason,
          valid: false
        });
      }

      // If cart provided, calculate discount
      let discountAmount = 0;
      if (cart && cart.subtotal) {
        // Check minimum purchase
        if (coupon.minimumPurchaseAmount && cart.subtotal < coupon.minimumPurchaseAmount) {
          return res.status(400).json({
            success: false,
            message: `Minimum purchase of $${coupon.minimumPurchaseAmount} required`,
            valid: false
          });
        }

        discountAmount = coupon.calculateDiscount(cart);
      }

      res.status(200).json({
        success: true,
        valid: true,
        data: {
          code: coupon.code,
          name: coupon.name,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          maxDiscountAmount: coupon.maxDiscountAmount,
          minimumPurchaseAmount: coupon.minimumPurchaseAmount,
          calculatedDiscount: discountAmount,
          endDate: coupon.endDate,
          canCombineWithOtherCoupons: coupon.canCombineWithOtherCoupons
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/coupons/:id
 * @desc    Get single coupon
 * @access  Public
 */
router.get(
  '/:id',
  [
    param('id').isMongoId().withMessage('Valid coupon ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const coupon = await Coupon.findById(req.params.id);

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      res.status(200).json({
        success: true,
        data: coupon
      });
    } catch (error) {
      next(error);
    }
  }
);

// Admin routes

/**
 * @route   GET /api/v1/coupons/admin/all
 * @desc    Get all coupons (admin)
 * @access  Private/Admin
 */
router.get('/admin/all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;

    const query = {};

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    const coupons = await Coupon.find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Coupon.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        coupons,
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
 * @route   POST /api/v1/coupons/admin
 * @desc    Create a coupon (admin)
 * @access  Private/Admin
 */
router.post(
  '/admin',
  protect,
  authorize('admin'),
  [
    body('code').notEmpty().withMessage('Coupon code is required').trim().toUpperCase(),
    body('name').notEmpty().withMessage('Coupon name is required'),
    body('discountType').isIn(['percentage', 'fixed', 'free_shipping', 'buy_x_get_y', 'tiered']).withMessage('Valid discount type is required'),
    body('discountValue').isFloat({ min: 0 }).withMessage('Discount value is required'),
    body('usageLimit').optional().isInt({ min: 1 }),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    validate
  ],
  async (req, res, next) => {
    try {
      const couponData = req.body;
      couponData.createdBy = req.user.id;

      // Check if code already exists
      const existingCoupon = await Coupon.findOne({ code: couponData.code.toUpperCase() });
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists'
        });
      }

      const coupon = await Coupon.create(couponData);

      res.status(201).json({
        success: true,
        message: 'Coupon created successfully',
        data: coupon
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/coupons/admin/:id
 * @desc    Update a coupon (admin)
 * @access  Private/Admin
 */
router.put(
  '/admin/:id',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid coupon ID is required'),
    body('code').optional().trim().toUpperCase(),
    body('isActive').optional().isBoolean(),
    body('discountValue').optional().isFloat({ min: 0 }),
    body('usageLimit').optional().isInt({ min: 1 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const coupon = await Coupon.findById(req.params.id);

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      // Check for duplicate code if changing
      if (req.body.code && req.body.code !== coupon.code) {
        const existingCoupon = await Coupon.findOne({ code: req.body.code.toUpperCase() });
        if (existingCoupon) {
          return res.status(400).json({
            success: false,
            message: 'Coupon code already exists'
          });
        }
      }

      const updatedCoupon = await Coupon.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      res.status(200).json({
        success: true,
        message: 'Coupon updated successfully',
        data: updatedCoupon
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/coupons/admin/:id
 * @desc    Delete a coupon (admin)
 * @access  Private/Admin
 */
router.delete(
  '/admin/:id',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid coupon ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const coupon = await Coupon.findByIdAndDelete(req.params.id);

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Coupon deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/coupons/admin/:id/analytics
 * @desc    Get coupon analytics (admin)
 * @access  Private/Admin
 */
router.get('/admin/:id/analytics', protect, authorize('admin'), async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('usedBy.user', 'firstName lastName email')
      .populate('usedBy.order', 'orderNumber total createdAt');

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Calculate additional analytics
    const analytics = {
      code: coupon.code,
      name: coupon.name,
      usageCount: coupon.usageCount,
      usageLimit: coupon.usageLimit,
      totalRevenue: coupon.totalRevenue,
      totalDiscountGiven: coupon.totalDiscountGiven,
      usedBy: coupon.usedBy,
      conversionRate: coupon.totalRevenue > 0 ? 
        ((coupon.usageCount / (coupon.usageCount + 100)) * 100).toFixed(2) : 0
    };

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/coupons/admin/:id/duplicate
 * @desc    Duplicate a coupon (admin)
 * @access  Private/Admin
 */
router.post(
  '/admin/:id/duplicate',
  protect,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const originalCoupon = await Coupon.findById(req.params.id);

      if (!originalCoupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      // Create duplicate with new code
      const newCode = `${originalCoupon.code}-${Date.now().toString().slice(-4)}`;
      
      const couponData = originalCoupon.toObject();
      delete couponData._id;
      delete couponData.createdAt;
      delete couponData.updatedAt;
      delete couponData.usageCount;
      delete couponData.totalRevenue;
      delete couponData.totalDiscountGiven;
      delete couponData.usedBy;
      couponData.code = newCode;
      couponData.createdBy = req.user.id;

      const newCoupon = await Coupon.create(couponData);

      res.status(201).json({
        success: true,
        message: 'Coupon duplicated successfully',
        data: newCoupon
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/coupons/admin/bulk-create
 * @desc    Bulk create coupons (admin)
 * @access  Private/Admin
 */
router.post(
  '/admin/bulk-create',
  protect,
  authorize('admin'),
  [
    body('coupons').isArray({ min: 1, max: 100 }).withMessage('Coupons array is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { coupons } = req.body;

      // Add createdBy to each coupon
      const couponsWithCreator = coupons.map(c => ({
        ...c,
        createdBy: req.user.id,
        code: c.code.toUpperCase()
      }));

      // Check for duplicate codes
      const codes = couponsWithCreator.map(c => c.code);
      const existingCoupons = await Coupon.find({ code: { $in: codes } });
      
      if (existingCoupons.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Some coupon codes already exist',
          existingCodes: existingCoupons.map(c => c.code)
        });
      }

      const createdCoupons = await Coupon.insertMany(couponsWithCreator);

      res.status(201).json({
        success: true,
        message: `${createdCoupons.length} coupons created successfully`,
        data: createdCoupons
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

