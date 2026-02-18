const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const Notification = require('../models/Notification');

/**
 * @route   GET /api/v1/notifications
 * @desc    Get current user's notifications
 * @access  Private
 */
router.get('/', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, read, archived } = req.query;

    const query = { user: req.user.id };

    if (read !== undefined) {
      query.read = read === 'true';
    }

    if (archived !== undefined) {
      query.archived = archived === 'true';
    }

    if (type) {
      query.type = type;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      read: false,
      archived: false
    });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        unreadCount
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/notifications/:id
 * @desc    Get single notification
 * @access  Private
 */
router.get(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Valid notification ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const notification = await Notification.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      res.status(200).json({
        success: true,
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/notifications
 * @desc    Create a notification (admin or system)
 * @access  Private/Admin
 */
router.post(
  '/',
  protect,
  authorize('admin'),
  [
    body('user').isMongoId().withMessage('User ID is required'),
    body('type').isIn([
      'order_placed', 'order_confirmed', 'order_shipped', 'order_delivered',
      'order_cancelled', 'payment_successful', 'payment_failed', 'refund_processed',
      'product_back_in_stock', 'price_drop', 'review_reminder', 'subscription_renewal',
      'subscription_failed', 'promotion', 'newsletter', 'account_security',
      'wishlist_sale', 'abandoned_cart', 'loyalty_points', 'birthday', 'system', 'other'
    ]).withMessage('Valid notification type is required'),
    body('title').notEmpty().withMessage('Title is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('channels').optional().isArray(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { user, type, title, message, order, product, subscription, channels, priority, scheduledFor, image } = req.body;

      const notification = await Notification.create({
        user,
        type,
        title,
        message,
        order,
        product,
        subscription,
        channels: channels || ['in_app'],
        priority: priority || 'normal',
        scheduledFor,
        image
      });

      res.status(201).json({
        success: true,
        message: 'Notification created',
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  '/:id/read',
  protect,
  [
    param('id').isMongoId().withMessage('Valid notification ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const notification = await Notification.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await notification.markAsRead();

      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/read-all', protect, async (req, res, next) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, read: false },
      { read: true, readAt: Date.now() }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/notifications/:id/archive
 * @desc    Archive notification
 * @access  Private
 */
router.put(
  '/:id/archive',
  protect,
  [
    param('id').isMongoId().withMessage('Valid notification ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const notification = await Notification.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await notification.archive();

      res.status(200).json({
        success: true,
        message: 'Notification archived',
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  '/:id',
  protect,
  [
    param('id').isMongoId().withMessage('Valid notification ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: req.params.id,
        user: req.user.id
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Notification deleted'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/notifications
 * @desc    Delete all read notifications or all notifications
 * @access  Private
 */
router.delete('/', protect, async (req, res, next) => {
  try {
    const { all } = req.query;

    let query = { user: req.user.id };

    if (!all) {
      query.read = true;
    }

    await Notification.deleteMany(query);

    res.status(200).json({
      success: true,
      message: all ? 'All notifications deleted' : 'Read notifications deleted'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/notifications/register-device
 * @desc    Register device for push notifications
 * @access  Private
 */
router.post(
  '/register-device',
  protect,
  [
    body('deviceToken').notEmpty().withMessage('Device token is required'),
    body('deviceType').isIn(['ios', 'android', 'web']).withMessage('Valid device type is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { deviceToken, deviceType } = req.body;

      // Store device token in user profile or separate collection
      const User = require('../models/User');
      await User.findByIdAndUpdate(req.user.id, {
        $push: {
          deviceTokens: {
            token: deviceToken,
            type: deviceType,
            addedAt: Date.now()
          }
        }
      });

      res.status(200).json({
        success: true,
        message: 'Device registered for push notifications'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/vifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/unread-count', protect, async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user.id,
      read: false,
      archived: false
    });

    res.status(200).json({
      success: true,
      data: { unreadCount: count }
    });
  } catch (error) {
    next(error);
  }
});

// Admin routes
/**
 * @route   GET /api/v1/notifications/admin/all
 * @desc    Get all notifications (admin)
 * @access  Private/Admin
 */
router.get('/admin/all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, userId, type, read } = req.query;

    const query = {};

    if (userId) query.user = userId;
    if (type) query.type = type;
    if (read !== undefined) query.read = read === 'true';

    const notifications = await Notification.find(query)
      .populate('user', 'firstName lastName email')
      .populate('order', 'orderNumber total')
      .populate('product', 'name price')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        notifications,
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
 * @route   POST /api/v1/notifications/admin/broadcast
 * @desc    Broadcast notification to all users
 * @access  Private/Admin
 */
router.post(
  '/admin/broadcast',
  protect,
  authorize('admin'),
  [
    body('type').isIn(['promotion', 'newsletter', 'system', 'other']).withMessage('Valid notification type is required'),
    body('title').notEmpty().withMessage('Title is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('targetUsers').optional().isIn(['all', 'active', 'inactive', 'new']),
    validate
  ],
  async (req, res, next) => {
    try {
      const { type, title, message, targetUsers, image } = req.body;

      const User = require('../models/User');
      let userQuery = {};

      if (targetUsers === 'active') {
        userQuery = { isActive: true };
      } else if (targetUsers === 'inactive') {
        userQuery = { isActive: false };
      } else if (targetUsers === 'new') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        userQuery = { createdAt: { $gte: thirtyDaysAgo } };
      }

      const users = await User.find(userQuery).select('_id');
      const userIds = users.map(u => u._id);

      // Create notifications in batches
      const notifications = userIds.map(userId => ({
        user: userId,
        type,
        title,
        message,
        channels: ['in_app', 'email'],
        priority: 'normal',
        image
      }));

      await Notification.insertMany(notifications);

      res.status(201).json({
        success: true,
        message: `Broadcast sent to ${userIds.length} users`
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

