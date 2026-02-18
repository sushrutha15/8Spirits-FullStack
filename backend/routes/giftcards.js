const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const GiftCard = require('../models/GiftCard');

/**
 * @route   GET /api/v1/giftcards
 * @desc    Get all gift cards (user's or all for admin)
 * @access  Private
 */
router.get('/', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    let query = { purchasedBy: req.user.id };

    // Admin can see all gift cards
    if (req.user.role === 'admin') {
      query = {};
      if (status) {
        query.status = status;
      }
    }

    const giftCards = await GiftCard.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await GiftCard.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        giftCards,
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
 * @route   GET /api/v1/giftcards/:id
 * @desc    Get single gift card
 * @access  Private
 */
router.get(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Valid gift card ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const giftCard = await GiftCard.findById(req.params.id);

      if (!giftCard) {
        return res.status(404).json({
          success: false,
          message: 'Gift card not found'
        });
      }

      // Check ownership for non-admin users
      if (giftCard.purchasedBy.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      res.status(200).json({
        success: true,
        data: giftCard
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/giftcards
 * @desc    Purchase a gift card
 * @access  Private
 */
router.post(
  '/',
  protect,
  [
    body('value').isFloat({ min: 5, max: 1000 }).withMessage('Gift card value must be between $5 and $1000'),
    body('recipientEmail').optional().isEmail(),
    body('recipientName').optional().trim(),
    body('recipientPhone').optional().trim(),
    body('message').optional().trim().maxLength(500),
    body('senderName').optional().trim(),
    body('deliveryMethod').optional().isIn(['email', 'sms', 'physical', 'immediate']),
    body('deliveryDate').optional().isISO8601(),
    body('design').optional().isObject(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { 
        value, recipientEmail, recipientName, recipientPhone, 
        message, senderName, deliveryMethod, deliveryDate, design 
      } = req.body;

      // Generate gift card code and PIN
      const code = await GiftCard.generateCode();
      const pin = await GiftCard.generatePIN();

      // Calculate expiration (default 1 year)
      const expirationDate = new Date();
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);

      const giftCard = await GiftCard.create({
        code,
        pin,
        initialValue: value,
        currentBalance: value,
        purchasedBy: req.user.id,
        recipientEmail,
        recipientName,
        recipientPhone,
        message,
        senderName: senderName || req.user.firstName + ' ' + req.user.lastName,
        deliveryMethod: deliveryMethod || 'email',
        deliveryDate,
        design,
        expirationDate,
        neverExpires: false,
        isReloadable: false,
        source: 'web'
      });

      res.status(201).json({
        success: true,
        message: 'Gift card created successfully',
        data: {
          giftCard: {
            id: giftCard._id,
            code: giftCard.code,
            initialValue: giftCard.initialValue,
            recipientEmail: giftCard.recipientEmail,
            recipientName: giftCard.recipientName,
            deliveryMethod: giftCard.deliveryMethod,
            deliveryDate: giftCard.deliveryDate,
            expirationDate: giftCard.expirationDate
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/giftcards/redeem
 * @desc    Redeem a gift card
 * @access  Private
 */
router.post(
  '/redeem',
  protect,
  [
    body('code').notEmpty().withMessage('Gift card code is required'),
    body('pin').optional(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { code, pin } = req.body;

      const giftCard = await GiftCard.findOne({ code: code.toUpperCase() });

      if (!giftCard) {
        return res.status(404).json({
          success: false,
          message: 'Invalid gift card code'
        });
      }

      // Check PIN if required (for physical cards)
      if (giftCard.pin && !pin) {
        return res.status(400).json({
          success: false,
          message: 'PIN is required for this gift card'
        });
      }

      if (giftCard.pin && pin !== giftCard.pin) {
        return res.status(400).json({
          success: false,
          message: 'Invalid PIN'
        });
      }

      const validation = giftCard.isValid();

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.reason
        });
      }

      res.status(200).json({
        success: true,
        data: {
          code: giftCard.code,
          currentBalance: giftCard.currentBalance,
          initialValue: giftCard.initialValue
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/giftcards/check-balance
 * @desc    Check gift card balance
 * @access  Public
 */
router.post(
  '/check-balance',
  [
    body('code').notEmpty().withMessage('Gift card code is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { code } = req.body;

      const giftCard = await GiftCard.findOne({ code: code.toUpperCase() })
        .select('-pin -usedBy -reloadHistory');

      if (!giftCard) {
        return res.status(404).json({
          success: false,
          message: 'Invalid gift card code'
        });
      }

      const validation = giftCard.isValid();

      await giftCard.checkBalance();

      res.status(200).json({
        success: true,
        data: {
          code: giftCard.code,
          status: giftCard.status,
          currentBalance: giftCard.currentBalance,
          initialValue: giftCard.initialValue,
          isValid: validation.valid,
          expirationDate: giftCard.expirationDate,
          neverExpires: giftCard.neverExpires
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/giftcards/:id/reload
 * @desc    Reload a gift card
 * @access  Private
 */
router.post(
  '/:id/reload',
  protect,
  [
    param('id').isMongoId().withMessage('Valid gift card ID is required'),
    body('amount').isFloat({ min: 5, max: 1000 }).withMessage('Reload amount must be between $5 and $1000'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { amount } = req.body;

      const giftCard = await GiftCard.findById(req.params.id);

      if (!giftCard) {
        return res.status(404).json({
          success: false,
          message: 'Gift card not found'
        });
      }

      if (!giftCard.isReloadable) {
        return res.status(400).json({
          success: false,
          message: 'This gift card is not reloadable'
        });
      }

      const previousBalance = giftCard.currentBalance;
      await giftCard.reload(amount, req.user.id, `REL${Date.now()}`);

      res.status(200).json({
        success: true,
        message: 'Gift card reloaded successfully',
        data: {
          previousBalance,
          newBalance: giftCard.currentBalance,
          amountAdded: amount
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/giftcards/:id/use
 * @desc    Use gift card (for order payment)
 * @access  Private
 */
router.post(
  '/:id/use',
  protect,
  [
    param('id').isMongoId().withMessage('Valid gift card ID is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount is required'),
    body('orderId').isMongoId().withMessage('Order ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { amount, orderId } = req.body;

      const giftCard = await GiftCard.findById(req.params.id);

      if (!giftCard) {
        return res.status(404).json({
          success: false,
          message: 'Gift card not found'
        });
      }

      const validation = giftCard.isValid();

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.reason
        });
      }

      if (amount > giftCard.currentBalance) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance'
        });
      }

      await giftCard.use(amount, req.user.id, orderId);

      res.status(200).json({
        success: true,
        message: 'Gift card applied successfully',
        data: {
          amountApplied: amount,
          remainingBalance: giftCard.currentBalance
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Admin routes

/**
 * @route   POST /api/v1/giftcards/admin/create
 * @desc    Create gift cards (admin)
 * @access  Private/Admin
 */
router.post(
  '/admin/create',
  protect,
  authorize('admin'),
  [
    body('count').optional().isInt({ min: 1, max: 100 }),
    body('value').isFloat({ min: 5, max: 1000 }),
    body('expirationDate').optional().isISO8601(),
    body('neverExpires').optional().isBoolean(),
    body('isReloadable').optional().isBoolean(),
    body('restrictions').optional().isObject(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { count = 1, value, expirationDate, neverExpires = false, isReloadable = false, restrictions } = req.body;

      const giftCards = [];

      for (let i = 0; i < count; i++) {
        const code = await GiftCard.generateCode();
        const pin = await GiftCard.generatePIN();

        giftCards.push({
          code,
          pin,
          initialValue: value,
          currentBalance: value,
          expirationDate,
          neverExpires,
          isReloadable,
          restrictions,
          purchasedBy: req.user.id,
          source: 'admin'
        });
      }

      const createdCards = await GiftCard.insertMany(giftCards);

      res.status(201).json({
        success: true,
        message: `${count} gift card(s) created successfully`,
        data: {
          giftCards: createdCards.map(c => ({
            id: c._id,
            code: c.code,
            pin: c.pin,
            value: c.initialValue
          }))
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/giftcards/admin/:id
 * @desc    Update gift card (admin)
 * @access  Private/Admin
 */
router.put(
  '/admin/:id',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid gift card ID is required'),
    body('status').optional().isIn(['active', 'redeemed', 'expired', 'cancelled', 'suspended']),
    body('currentBalance').optional().isFloat({ min: 0 }),
    body('expirationDate').optional().isISO8601(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { status, currentBalance, expirationDate, internalNotes } = req.body;

      const giftCard = await GiftCard.findById(req.params.id);

      if (!giftCard) {
        return res.status(404).json({
          success: false,
          message: 'Gift card not found'
        });
      }

      if (status) giftCard.status = status;
      if (currentBalance !== undefined) giftCard.currentBalance = currentBalance;
      if (expirationDate) giftCard.expirationDate = expirationDate;
      if (internalNotes) giftCard.internalNotes = internalNotes;

      await giftCard.save();

      res.status(200).json({
        success: true,
        message: 'Gift card updated',
        data: giftCard
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/giftcards/admin/:id
 * @desc    Delete gift card (admin)
 * @access  Private/Admin
 */
router.delete(
  '/admin/:id',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid gift card ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const giftCard = await GiftCard.findByIdAndDelete(req.params.id);

      if (!giftCard) {
        return res.status(404).json({
          success: false,
          message: 'Gift card not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Gift card deleted'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/giftcards/admin/stats
 * @desc    Get gift card statistics (admin)
 * @access  Private/Admin
 */
router.get('/admin/stats', protect, authorize('admin'), async (req, res, next) => {
  try {
    const stats = await GiftCard.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$initialValue' },
          totalBalance: { $sum: '$currentBalance' }
        }
      }
    ]);

    const totalCards = await GiftCard.countDocuments();
    const activeCards = await GiftCard.countDocuments({ status: 'active' });
    const totalValue = await GiftCard.sum('initialValue');
    const totalBalance = await GiftCard.sum('currentBalance');

    res.status(200).json({
      success: true,
      data: {
        totalCards,
        activeCards,
        totalValue: totalValue || 0,
        totalBalance: totalBalance || 0,
        byStatus: stats
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

