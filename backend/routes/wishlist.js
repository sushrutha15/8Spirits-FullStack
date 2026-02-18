const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect } = require('../middleware/auth');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

/**
 * @route   GET /api/v1/wishlist
 * @desc    Get current user's wishlist
 * @access  Private
 */
router.get('/', protect, async (req, res, next) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user.id })
      .populate('items.product', 'name price images slug stock');

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user.id, items: [] });
    }

    res.status(200).json({
      success: true,
      data: wishlist
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/wishlist/items
 * @desc    Add item to wishlist
 * @access  Private
 */
router.post(
  '/items',
  protect,
  [
    body('productId').isMongoId().withMessage('Valid product ID is required'),
    body('variantId').optional().isMongoId(),
    body('targetPrice').optional().isFloat({ min: 0 }),
    body('notes').optional().trim(),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    validate
  ],
  async (req, res, next) => {
    try {
      const { productId, variantId, targetPrice, notes, priority } = req.body;

      // Check if product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      let wishlist = await Wishlist.findOne({ user: req.user.id });

      if (!wishlist) {
        wishlist = await Wishlist.create({
          user: req.user.id,
          items: []
        });
      }

      // Check if item already exists
      const existingItem = wishlist.items.find(
        item => item.product.toString() === productId
      );

      if (existingItem) {
        return res.status(400).json({
          success: false,
          message: 'Product already in wishlist'
        });
      }

      wishlist.items.push({
        product: productId,
        variant: variantId,
        priceWhenAdded: product.price,
        currentPrice: product.price,
        targetPrice,
        inStockWhenAdded: product.stock > 0,
        notes,
        priority: priority || 'medium'
      });

      await wishlist.save();

      // Populate the product details
      await wishlist.populate('items.product', 'name price images slug stock');

      res.status(201).json({
        success: true,
        message: 'Product added to wishlist',
        data: wishlist
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/wishlist/items/:productId
 * @desc    Remove item from wishlist
 * @access  Private
 */
router.delete(
  '/items/:productId',
  protect,
  [
    param('productId').isMongoId().withMessage('Valid product ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { productId } = req.params;

      const wishlist = await Wishlist.findOne({ user: req.user.id });

      if (!wishlist) {
        return res.status(404).json({
          success: false,
          message: 'Wishlist not found'
        });
      }

      const itemIndex = wishlist.items.findIndex(
        item => item.product.toString() === productId
      );

      if (itemIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Product not found in wishlist'
        });
      }

      wishlist.items.splice(itemIndex, 1);
      wishlist.totalItemsRemoved += 1;
      await wishlist.save();

      res.status(200).json({
        success: true,
        message: 'Product removed from wishlist',
        data: wishlist
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/wishlist/items/:productId
 * @desc    Update wishlist item (notes, priority, price alert)
 * @access  Private
 */
router.put(
  '/items/:productId',
  protect,
  [
    param('productId').isMongoId().withMessage('Valid product ID is required'),
    body('targetPrice').optional().isFloat({ min: 0 }),
    body('priceDropAlert').optional().isBoolean(),
    body('stockAlert').optional().isBoolean(),
    body('notes').optional().trim(),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    validate
  ],
  async (req, res, next) => {
    try {
      const { productId } = req.params;
      const { targetPrice, priceDropAlert, stockAlert, notes, priority } = req.body;

      const wishlist = await Wishlist.findOne({ user: req.user.id });

      if (!wishlist) {
        return res.status(404).json({
          success: false,
          message: 'Wishlist not found'
        });
      }

      const item = wishlist.items.find(
        item => item.product.toString() === productId
      );

      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Product not found in wishlist'
        });
      }

      // Update fields
      if (targetPrice !== undefined) item.targetPrice = targetPrice;
      if (priceDropAlert !== undefined) item.priceDropAlert = priceDropAlert;
      if (stockAlert !== undefined) item.stockAlert = stockAlert;
      if (notes !== undefined) item.notes = notes;
      if (priority) item.priority = priority;

      await wishlist.save();
      await wishlist.populate('items.product', 'name price images slug stock');

      res.status(200).json({
        success: true,
        message: 'Wishlist item updated',
        data: wishlist
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/wishlist/price-drops
 * @desc    Check for price drops in wishlist
 * @access  Private
 */
router.get('/price-drops', protect, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const priceDrops = await wishlist.checkPriceDrops();

    res.status(200).json({
      success: true,
      data: {
        priceDrops,
        count: priceDrops.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/wishlist/back-in-stock
 * @desc    Check for back in stock items in wishlist
 * @access  Private
 */
router.get('/back-in-stock', protect, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const backInStock = await wishlist.checkBackInStock();

    res.status(200).json({
      success: true,
      data: {
        backInStock,
        count: backInStock.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/wishlist/move-to-cart/:productId
 * @desc    Move wishlist item to cart
 * @access  Private
 */
router.post(
  '/move-to-cart/:productId',
  protect,
  [
    param('productId').isMongoId().withMessage('Valid product ID is required'),
    body('quantity').optional().isInt({ min: 1 }),
    validate
  ],
  async (req, res, next) => {
    try {
      const { productId } = req.params;
      const { quantity = 1 } = req.body;

      const wishlist = await Wishlist.findOne({ user: req.user.id });

      if (!wishlist) {
        return res.status(404).json({
          success: false,
          message: 'Wishlist not found'
        });
      }

      const item = wishlist.items.find(
        item => item.product.toString() === productId
      );

      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Product not found in wishlist'
        });
      }

      const Cart = require('../models/Cart');
      let cart = await Cart.findOne({ user: req.user.id });

      if (!cart) {
        cart = new Cart({ user: req.user.id, items: [] });
      }

      // Check if item already in cart
      const existingItem = cart.items.find(
        cartItem => cartItem.product.toString() === productId
      );

      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cart.items.push({
          product: productId,
          quantity,
          price: item.currentPrice
        });
      }

      await cart.save();

      // Remove from wishlist
      wishlist.items = wishlist.items.filter(
        i => i.product.toString() !== productId
      );
      await wishlist.save();

      res.status(200).json({
        success: true,
        message: 'Item moved to cart',
        data: { cart }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/v1/wishlist
 * @desc    Clear all items from wishlist
 * @access  Private
 */
router.delete('/', protect, async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    wishlist.items = [];
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: 'Wishlist cleared'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/wishlist/shared/:shareId
 * @desc    Get shared wishlist by share ID
 * @access  Public
 */
router.get('/shared/:shareId', async (req, res, next) => {
  try {
    const { shareId } = req.params;

    const wishlist = await Wishlist.findOne({ shareUrl: shareId, isPublic: true })
      .populate('items.product', 'name price images slug stock description');

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Shared wishlist not found or not public'
      });
    }

    res.status(200).json({
      success: true,
      data: wishlist
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/wishlist/share
 * @desc    Make wishlist public/private
 * @access  Private
 */
router.put('/share', protect, async (req, res, next) => {
  try {
    const { isPublic } = req.body;

    let wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user.id, items: [] });
    }

    wishlist.isPublic = isPublic;
    
    if (isPublic && !wishlist.shareUrl) {
      const { nanoid } = require('nanoid');
      wishlist.shareUrl = nanoid(10);
    }

    await wishlist.save();

    res.status(200).json({
      success: true,
      data: {
        isPublic: wishlist.isPublic,
        shareUrl: wishlist.shareUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

