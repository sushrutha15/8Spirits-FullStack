const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const { Review, Order } = require('../models/index');
const Product = require('../models/Product');

/**
 * @route   GET /api/reviews/product/:productId
 * @desc    Get all reviews for a product
 * @access  Public
 */
router.get('/product/:productId', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, sort = '-createdAt' } = req.query;
    const skip = (page - 1) * limit;

    const query = {
      product: req.params.productId,
      isApproved: true
    };

    const reviews = await Review.find(query)
      .populate('user', 'firstName lastName avatar')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit));

    const total = await Review.countDocuments(query);

    // Calculate rating breakdown
    const ratingBreakdown = await Review.aggregate([
      { $match: { product: req.params.productId, isApproved: true } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: {
        reviews,
        ratingBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/reviews
 * @desc    Create a review
 * @access  Private
 */
router.post(
  '/',
  protect,
  [
    body('product').notEmpty().withMessage('Product ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('title').trim().notEmpty().withMessage('Review title is required'),
    body('comment').trim().notEmpty().withMessage('Review comment is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { product, rating, title, comment, images } = req.body;

      // Check if product exists
      const productExists = await Product.findById(product);
      if (!productExists) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check if user already reviewed this product
      const existingReview = await Review.findOne({
        product,
        user: req.user.id
      });

      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'You have already reviewed this product'
        });
      }

      // Check if user purchased this product
      const hasPurchased = await Order.findOne({
        user: req.user.id,
        'items.product': product,
        orderStatus: 'delivered'
      });

      const review = await Review.create({
        product,
        user: req.user.id,
        rating,
        title,
        comment,
        images: images || [],
        verifiedPurchase: !!hasPurchased
      });

      // Update product rating
      await productExists.updateRating();

      await review.populate('user', 'firstName lastName avatar');

      res.status(201).json({
        success: true,
        message: 'Review created successfully',
        data: { review }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/reviews/:id
 * @desc    Update own review
 * @access  Private
 */
router.put(
  '/:id',
  protect,
  [
    body('rating').optional().isInt({ min: 1, max: 5 }),
    body('title').optional().trim().notEmpty(),
    body('comment').optional().trim().notEmpty(),
    validate
  ],
  async (req, res, next) => {
    try {
      let review = await Review.findById(req.params.id);

      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found'
        });
      }

      // Check ownership
      if (review.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this review'
        });
      }

      const { rating, title, comment, images } = req.body;

      if (rating) review.rating = rating;
      if (title) review.title = title;
      if (comment) review.comment = comment;
      if (images) review.images = images;

      await review.save();

      // Update product rating
      const product = await Product.findById(review.product);
      await product.updateRating();

      await review.populate('user', 'firstName lastName avatar');

      res.status(200).json({
        success: true,
        message: 'Review updated successfully',
        data: { review }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete review
 * @access  Private
 */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check ownership or admin
    if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this review'
      });
    }

    const productId = review.product;
    await review.deleteOne();

    // Update product rating
    const product = await Product.findById(productId);
    await product.updateRating();

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/reviews/:id/helpful
 * @desc    Mark review as helpful
 * @access  Private
 */
router.put('/:id/helpful', protect, async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.helpfulCount += 1;
    await review.save();

    res.status(200).json({
      success: true,
      message: 'Review marked as helpful',
      data: { review }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/reviews/user/my-reviews
 * @desc    Get current user's reviews
 * @access  Private
 */
router.get('/user/my-reviews', protect, async (req, res, next) => {
  try {
    const reviews = await Review.find({ user: req.user.id })
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
 * @route   PUT /api/reviews/:id/approve
 * @desc    Approve/reject review (Admin)
 * @access  Private/Admin
 */
router.put(
  '/:id/approve',
  protect,
  authorize('admin'),
  [
    body('isApproved').isBoolean().withMessage('isApproved must be boolean'),
    validate
  ],
  async (req, res, next) => {
    try {
      const review = await Review.findById(req.params.id);

      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found'
        });
      }

      review.isApproved = req.body.isApproved;
      await review.save();

      // Update product rating
      const product = await Product.findById(review.product);
      await product.updateRating();

      res.status(200).json({
        success: true,
        message: `Review ${req.body.isApproved ? 'approved' : 'rejected'}`,
        data: { review }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/reviews/admin/pending
 * @desc    Get pending reviews (Admin)
 * @access  Private/Admin
 */
router.get('/admin/pending', protect, authorize('admin'), async (req, res, next) => {
  try {
    const reviews = await Review.find({ isApproved: false })
      .populate('user', 'firstName lastName email')
      .populate('product', 'name slug')
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

module.exports = router;