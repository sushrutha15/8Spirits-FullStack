const express = require('express');
const router = express.Router();
const { body, param, query: queryValidator } = require('express-validator');
const { isMongoId } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const LoyaltyService = require('../services/loyaltyProgram');

/**
 * @route   GET /api/v1/loyalty/status
 * @desc    Get user's loyalty status
 * @access  Private
 */
router.get('/status', protect, async (req, res, next) => {
  try {
    const status = await LoyaltyService.getLoyaltyStatus(req.user.id);

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/loyalty/rewards
 * @desc    Get available rewards for user's tier
 * @access  Private
 */
router.get('/rewards', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);

    let tier = 'bronze';
    if (user.loyaltyPoints) {
      tier = user.loyaltyPoints.tier;
    }

    const rewards = LoyaltyService.getAvailableRewards(tier);

    res.status(200).json({
      success: true,
      data: rewards
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/loyalty/benefits
 * @desc    Get tier benefits
 * @access  Public
 */
router.get('/benefits', async (req, res, next) => {
  try {
    const { tier } = req.query;

    if (tier) {
      const benefits = LoyaltyService.getTierBenefits(tier);
      return res.status(200).json({
        success: true,
        data: benefits
      });
    }

    // Return all tier benefits
    const allBenefits = {
      bronze: LoyaltyService.getTierBenefits('bronze'),
      silver: LoyaltyService.getTierBenefits('silver'),
      gold: LoyaltyService.getTierBenefits('gold'),
      platinum: LoyaltyService.getTierBenefits('platinum'),
      diamond: LoyaltyService.getTierBenefits('diamond')
    };

    res.status(200).json({
      success: true,
      data: allBenefits
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/loyalty/history
 * @desc    Get points history
 * @access  Private
 */
router.get('/history', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;

    const status = await LoyaltyService.getLoyaltyStatus(req.user.id);
    
    let history = status.pointsHistory;
    
    if (type) {
      history = history.filter(h => h.type === type);
    }

    const startIndex = (page - 1) * limit;
    const paginatedHistory = history.slice(startIndex, startIndex + parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        history: paginatedHistory,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: history.length,
          pages: Math.ceil(history.length / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/loyalty/redeem
 * @desc    Redeem points
 * @access  Private
 */
router.post(
  '/redeem',
  protect,
  [
    body('points').isInt({ min: 1 }).withMessage('Points amount is required'),
    body('description').optional().trim(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { points, description } = req.body;

      const result = await LoyaltyService.redeemPoints(req.user.id, points, description);

      res.status(200).json({
        success: true,
        message: 'Points redeemed successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/loyalty/claim-reward
 * @desc    Claim a reward
 * @access  Private
 */
router.post(
  '/claim-reward',
  protect,
  [
    body('rewardId').notEmpty().withMessage('Reward ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { rewardId } = req.body;

      const result = await LoyaltyService.claimReward(req.user.id, rewardId);

      res.status(200).json({
        success: true,
        message: 'Reward claimed successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/loyalty/use-reward
 * @desc    Use a claimed reward
 * @access  Private
 */
router.post(
  '/use-reward',
  protect,
  [
    body('rewardClaimId').isMongoId().withMessage('Valid reward claim ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { rewardClaimId } = req.body;

      const reward = await LoyaltyService.useReward(req.user.id, rewardClaimId);

      res.status(200).json({
        success: true,
        message: 'Reward used successfully',
        data: reward
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/loyalty/refer
 * @desc    Apply referral code
 * @access  Private
 */
router.post(
  '/refer',
  protect,
  [
    body('referralCode').notEmpty().withMessage('Referral code is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { referralCode } = req.body;

      // Find referrer by code
      const User = require('../models/User');
      const referrer = await User.findOne({ 'loyaltyPoints.referralCode': referralCode.toUpperCase() });

      if (!referrer) {
        return res.status(404).json({
          success: false,
          message: 'Invalid referral code'
        });
      }

      if (referrer._id.toString() === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'You cannot refer yourself'
        });
      }

      const result = await LoyaltyService.processReferral(referrer._id, req.user.id);

      res.status(200).json({
        success: true,
        message: 'Referral applied successfully! You and your referrer both earned bonus points.',
        data: result
      });
    } catch (error) {
      if (error.message.includes('already referred')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/loyalty/referral-code
 * @desc    Get user's referral code
 * @access  Private
 */
router.get('/referral-code', protect, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);

    if (!user.loyaltyPoints) {
      await LoyaltyService.initializeForUser(req.user.id);
    }

    res.status(200).json({
      success: true,
      data: {
        referralCode: user.loyaltyPoints.referralCode,
        referralUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?ref=${user.loyaltyPoints.referralCode}`
      }
    });
  } catch (error) {
    next(error);
  }
}
);

// Admin routes

/**
 * @route   GET /api/v1/loyalty/admin/all
 * @desc    Get all loyalty members (admin)
 * @access  Private/Admin
 */
router.get('/admin/all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, tier, search } = req.query;

    const User = require('../models/User');
    const query = { 'loyaltyPoints': { $exists: true } };

    if (tier) {
      query['loyaltyPoints.tier'] = tier;
    }

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('firstName lastName email loyaltyPoints createdAt')
      .sort({ 'loyaltyPoints.totalPointsEarned': -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    // Calculate stats
    const stats = await User.aggregate([
      { $match: { 'loyaltyPoints': { $exists: true } } },
      {
        $group: {
          _id: '$loyaltyPoints.tier',
          count: { $sum: 1 },
          totalPoints: { $sum: '$loyaltyPoints.totalPointsEarned' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        members: users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        stats
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/loyalty/admin/award-points
 * @desc    Award points to user (admin)
 * @access  Private/Admin
 */
router.post(
  '/admin/award-points',
  protect,
  authorize('admin'),
  [
    body('userId').isMongoId().withMessage('User ID is required'),
    body('points').isInt({ min: 1 }).withMessage('Points amount is required'),
    body('description').notEmpty().withMessage('Description is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { userId, points, description } = req.body;

      const User = require('../models/User');
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.loyaltyPoints) {
        await LoyaltyService.initializeForUser(userId);
      }

      user.loyaltyPoints.points += points;
      user.loyaltyPoints.totalPointsEarned += points;
      user.loyaltyPoints.pointsHistory.push({
        type: 'bonus',
        points,
        description: `${description} (Awarded by admin)`,
        date: new Date()
      });

      await user.save();

      res.status(200).json({
        success: true,
        message: 'Points awarded successfully',
        data: {
          pointsAwarded: points,
          newTotalPoints: user.loyaltyPoints.points,
          tier: user.loyaltyPoints.tier
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/loyalty/admin/deduct-points
 * @desc    Deduct points from user (admin)
 * @access  Private/Admin
 */
router.post(
  '/admin/deduct-points',
  protect,
  authorize('admin'),
  [
    body('userId').isMongoId().withMessage('User ID is required'),
    body('points').isInt({ min: 1 }).withMessage('Points amount is required'),
    body('description').notEmpty().withMessage('Description is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { userId, points, description } = req.body;

      const User = require('../models/User');
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.loyaltyPoints || user.loyaltyPoints.points < points) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient points'
        });
      }

      user.loyaltyPoints.points -= points;
      user.loyaltyPoints.pointsHistory.push({
        type: 'deducted',
        points: -points,
        description: `${description} (Deducted by admin)`,
        date: new Date()
      });

      await user.save();

      res.status(200).json({
        success: true,
        message: 'Points deducted successfully',
        data: {
          pointsDeducted: points,
          newTotalPoints: user.loyaltyPoints.points,
          tier: user.loyaltyPoints.tier
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/loyalty/admin/:userId/tier
 * @desc    Update user tier (admin)
 * @access  Private/Admin
 */
router.put(
  '/admin/:userId/tier',
  protect,
  authorize('admin'),
  [
    param('userId').isMongoId().withMessage('Valid user ID is required'),
    body('tier').isIn(['bronze', 'silver', 'gold', 'platinum', 'diamond']).withMessage('Valid tier is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { tier } = req.body;

      const User = require('../models/User');
      const user = await User.findById(req.params.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.loyaltyPoints) {
        await LoyaltyService.initializeForUser(req.params.userId);
      }

      const oldTier = user.loyaltyPoints.tier;
      user.loyaltyPoints.tier = tier;
      user.loyaltyPoints.tierHistory.push({
        tier,
        earnedAt: new Date(),
        reason: 'Manual adjustment by admin'
      });

      await user.save();

      res.status(200).json({
        success: true,
        message: `Tier updated from ${oldTier} to ${tier}`,
        data: {
          oldTier,
          newTier: tier
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

