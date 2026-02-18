const express = require('express');
const router = express.Router();
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const Store = require('../models/Store');

/**
 * @route   GET /api/v1/stores
 * @desc    Get all stores
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, city, state, feature } = req.query;

    const filter = { isActive: true };

    if (city) filter['address.city'] = new RegExp(city, 'i');
    if (state) filter['address.state'] = state;
    if (feature) filter.features = feature;

    const stores = await Store.find(filter)
      .select('-location')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Store.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        stores,
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
 * @route   GET /api/v1/stores/nearby
 * @desc    Find nearby stores
 * @access  Public
 */
router.get(
  '/nearby',
  [
    queryValidator('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    queryValidator('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    queryValidator('radius').optional().isFloat({ min: 1, max: 100 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const { latitude, longitude, radius = 50 } = req.query;

      // Use MongoDB's $near geospatial query
      const stores = await Store.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: parseFloat(radius) * 1609.34 // Convert miles to meters
          }
        },
        isActive: true,
        temporarilyClosed: { $ne: true }
      })
        .select('-location')
        .limit(20);

      // Calculate distance for each store
      const storesWithDistance = stores.map(store => {
        const storeDoc = store.toObject();
        storeDoc.distance = store.getDistanceFrom(parseFloat(longitude), parseFloat(latitude));
        storeDoc.isOpenNow = store.isOpenNow();
        return storeDoc;
      });

      res.status(200).json({
        success: true,
        data: storesWithDistance
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/stores/slug/:slug
 * @desc    Get store by slug/store number
 * @access  Public
 */
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const store = await Store.findOne({
      $or: [
        { storeNumber: slug },
        { name: new RegExp(slug, 'i') }
      ],
      isActive: true
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    const storeDoc = store.toObject();
    storeDoc.isOpenNow = store.isOpenNow();

    res.status(200).json({
      success: true,
      data: storeDoc
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/stores/:id
 * @desc    Get single store
 * @access  Public
 */
router.get(
  '/:id',
  [
    param('id').isMongoId().withMessage('Valid store ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const store = await Store.findById(req.params.id);

      if (!store) {
        return res.status(404).json({
          success: false,
          message: 'Store not found'
        });
      }

      const storeDoc = store.toObject();
      storeDoc.isOpenNow = store.isOpenNow();

      res.status(200).json({
        success: true,
        data: storeDoc
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/stores/:id/events
 * @desc    Get store events
 * @access  Public
 */
router.get('/:id/events', async (req, res, next) => {
  try {
    const store = await Store.findById(req.params.id)
      .select('upcomingEvents');

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found'
      });
    }

    const now = new Date();
    const upcomingEvents = store.upcomingEvents
      .filter(event => new Date(event.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.status(200).json({
      success: true,
      data: upcomingEvents
    });
  } catch (error) {
    next(error);
  }
});

// Admin routes

/**
 * @route   GET /api/v1/stores/admin/all
 * @desc    Get all stores (admin)
 * @access  Private/Admin
 */
router.get('/admin/all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, isActive } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { storeNumber: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } }
      ];
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const stores = await Store.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Store.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        stores,
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
 * @route   POST /api/v1/stores/admin
 * @desc    Create a store (admin)
 * @access  Private/Admin
 */
router.post(
  '/admin',
  protect,
  authorize('admin'),
  [
    body('name').notEmpty().withMessage('Store name is required'),
    body('storeNumber').notEmpty().withMessage('Store number is required'),
    body('address').isObject().withMessage('Address is required'),
    body('address.address1').notEmpty(),
    body('address.city').notEmpty(),
    body('address.state').notEmpty(),
    body('address.zipCode').notEmpty(),
    body('location').isObject().withMessage('Location is required'),
    body('location.coordinates').isArray({ min: 2, max: 2 }),
    body('phone').notEmpty().withMessage('Phone is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const storeData = req.body;

      // Check if store number already exists
      const existingStore = await Store.findOne({ storeNumber: storeData.storeNumber });
      if (existingStore) {
        return res.status(400).json({
          success: false,
          message: 'Store number already exists'
        });
      }

      const store = await Store.create(storeData);

      res.status(201).json({
        success: true,
        message: 'Store created successfully',
        data: store
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/stores/admin/:id
 * @desc    Update a store (admin)
 * @access  Private/Admin
 */
router.put(
  '/admin/:id',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid store ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const store = await Store.findById(req.params.id);

      if (!store) {
        return res.status(404).json({
          success: false,
          message: 'Store not found'
        });
      }

      const updatedStore = await Store.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      res.status(200).json({
        success: true,
        message: 'Store updated successfully',
        data: updatedStore
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/stores/admin/:id
 * @desc    Delete a store (admin)
 * @access  Private/Admin
 */
router.delete(
  '/admin/:id',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid store ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const store = await Store.findByIdAndDelete(req.params.id);

      if (!store) {
        return res.status(404).json({
          success: false,
          message: 'Store not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Store deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/stores/admin/:id/temporarily-close
 * @desc    Temporarily close a store (admin)
 * @access  Private/Admin
 */
router.put(
  '/admin/:id/temporarily-close',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid store ID is required'),
    body('reason').optional(),
    body('reopeningDate').optional().isISO8601(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { reason, reopeningDate } = req.body;

      const store = await Store.findById(req.params.id);

      if (!store) {
        return res.status(404).json({
          success: false,
          message: 'Store not found'
        });
      }

      store.temporarilyClosed = true;
      store.closureReason = reason;
      store.reopeningDate = reopeningDate;
      await store.save();

      res.status(200).json({
        success: true,
        message: 'Store temporarily closed',
        data: store
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/stores/admin/:id/reopen
 * @desc    Reopen a store (admin)
 * @access  Private/Admin
 */
router.put(
  '/admin/:id/reopen',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid store ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const store = await Store.findById(req.params.id);

      if (!store) {
        return res.status(404).json({
          success: false,
          message: 'Store not found'
        });
      }

      store.temporarilyClosed = false;
      store.closureReason = null;
      store.reopeningDate = null;
      await store.save();

      res.status(200).json({
        success: true,
        message: 'Store reopened',
        data: store
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/stores/admin/:id/events
 * @desc    Add event to store (admin)
 * @access  Private/Admin
 */
router.post(
  '/admin/:id/events',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Valid store ID is required'),
    body('name').notEmpty().withMessage('Event name is required'),
    body('date').isISO8601().withMessage('Event date is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const store = await Store.findById(req.params.id);

      if (!store) {
        return res.status(404).json({
          success: false,
          message: 'Store not found'
        });
      }

      store.upcomingEvents.push(req.body);
      await store.save();

      res.status(201).json({
        success: true,
        message: 'Event added to store',
        data: store.upcomingEvents
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/stores/admin/stats
 * @desc    Get store statistics (admin)
 * @access  Private/Admin
 */
router.get('/admin/stats', protect, authorize('admin'), async (req, res, next) => {
  try {
    const totalStores = await Store.countDocuments();
    const activeStores = await Store.countDocuments({ isActive: true, temporarilyClosed: false });
    const temporarilyClosed = await Store.countDocuments({ temporarilyClosed: true });

    // Get stores by state
    const byState = await Store.aggregate([
      { $group: { _id: '$address.state', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get stores by features
    const byFeatures = await Store.aggregate([
      { $unwind: '$features' },
      { $group: { _id: '$features', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalStores,
        activeStores,
        temporarilyClosed,
        byState,
        byFeatures
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

