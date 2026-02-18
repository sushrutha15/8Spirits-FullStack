const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect } = require('../middleware/auth');
const { Cart } = require('../models/index');
const Product = require('../models/Product');

/**
 * @route   GET /api/cart
 * @desc    Get user's cart
 * @access  Private
 */
router.get('/', protect, async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id })
      .populate('items.product', 'name slug price images stock');

    if (!cart) {
      cart = await Cart.create({ user: req.user.id, items: [] });
    }

    // Calculate totals
    let subtotal = 0;
    cart.items.forEach(item => {
      if (item.product) {
        subtotal += item.product.price * item.quantity;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        cart,
        subtotal,
        itemCount: cart.items.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/cart/items
 * @desc    Add item to cart
 * @access  Private
 */
router.post(
  '/items',
  protect,
  [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { productId, quantity } = req.body;

      // Check if product exists and has stock
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock'
        });
      }

      // Get or create cart
      let cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        cart = await Cart.create({ user: req.user.id, items: [] });
      }

      // Check if item already in cart
      const existingItem = cart.items.find(
        item => item.product.toString() === productId
      );

      if (existingItem) {
        existingItem.quantity += quantity;
        existingItem.price = product.price;
      } else {
        cart.items.push({
          product: productId,
          quantity,
          price: product.price
        });
      }

      await cart.save();
      await cart.populate('items.product', 'name slug price images stock');

      res.status(200).json({
        success: true,
        message: 'Item added to cart',
        data: { cart }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/cart/items/:productId
 * @desc    Update cart item quantity
 * @access  Private
 */
router.put(
  '/items/:productId',
  protect,
  [
    body('quantity').isInt({ min: 0 }).withMessage('Quantity must be 0 or more'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { quantity } = req.body;
      const cart = await Cart.findOne({ user: req.user.id });

      if (!cart) {
        return res.status(404).json({
          success: false,
          message: 'Cart not found'
        });
      }

      const itemIndex = cart.items.findIndex(
        item => item.product.toString() === req.params.productId
      );

      if (itemIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Item not found in cart'
        });
      }

      // If quantity is 0, remove item
      if (quantity === 0) {
        cart.items.splice(itemIndex, 1);
      } else {
        // Check stock
        const product = await Product.findById(req.params.productId);
        if (product.stock < quantity) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient stock'
          });
        }
        cart.items[itemIndex].quantity = quantity;
      }

      await cart.save();
      await cart.populate('items.product', 'name slug price images stock');

      res.status(200).json({
        success: true,
        message: 'Cart updated',
        data: { cart }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/cart/items/:productId
 * @desc    Remove item from cart
 * @access  Private
 */
router.delete('/items/:productId', protect, async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = cart.items.filter(
      item => item.product.toString() !== req.params.productId
    );

    await cart.save();
    await cart.populate('items.product', 'name slug price images stock');

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: { cart }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/cart
 * @desc    Clear cart
 * @access  Private
 */
router.delete('/', protect, async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = [];
    await cart.save();

    res.status(200).json({
      success: true,
      message: 'Cart cleared',
      data: { cart }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;