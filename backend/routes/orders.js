const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const { Order, Cart } = require('../models/index');
const Product = require('../models/Product');

/**
 * @route   POST /api/orders
 * @desc    Create new order from cart
 * @access  Private
 */
router.post(
  '/',
  protect,
  [
    body('shippingAddress').notEmpty().withMessage('Shipping address is required'),
    body('paymentMethod').notEmpty().withMessage('Payment method is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { shippingAddress, billingAddress, paymentMethod, notes } = req.body;

      // Get user's cart
      const cart = await Cart.findOne({ user: req.user.id })
        .populate('items.product');

      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty'
        });
      }

      // Verify stock availability
      for (const item of cart.items) {
        if (item.product.stock < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.product.name}`
          });
        }
      }

      // Calculate totals
      const subtotal = cart.items.reduce(
        (sum, item) => sum + (item.product.price * item.quantity),
        0
      );
      const tax = subtotal * 0.08; // 8% tax
      const shippingCost = subtotal > 100 ? 0 : 10; // Free shipping over $100
      const total = subtotal + tax + shippingCost;

      // Create order
      const order = await Order.create({
        user: req.user.id,
        items: cart.items.map(item => ({
          product: item.product._id,
          name: item.product.name,
          image: item.product.images[0]?.url,
          quantity: item.quantity,
          price: item.product.price
        })),
        shippingAddress,
        billingAddress: billingAddress || shippingAddress,
        subtotal,
        tax,
        shippingCost,
        total,
        paymentMethod,
        notes
      });

      // Update product stock and sales count
      for (const item of cart.items) {
        await Product.findByIdAndUpdate(item.product._id, {
          $inc: {
            stock: -item.quantity,
            salesCount: item.quantity
          }
        });
      }

      // Clear cart
      cart.items = [];
      await cart.save();

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: { order }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/orders
 * @desc    Get user's orders
 * @access  Private
 */
router.get('/', protect, async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort('-createdAt')
      .populate('items.product', 'name slug images');

    res.status(200).json({
      success: true,
      count: orders.length,
      data: { orders }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/orders/:id
 * @desc    Get single order
 * @access  Private
 */
router.get('/:id', protect, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name slug images')
      .populate('user', 'firstName lastName email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Make sure user owns order or is admin
    if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order'
      });
    }

    res.status(200).json({
      success: true,
      data: { order }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/orders/:id/cancel
 * @desc    Cancel order
 * @access  Private
 */
router.put('/:id/cancel', protect, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check ownership
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Can only cancel pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel order at this stage'
      });
    }

    order.orderStatus = 'cancelled';
    order.cancelledAt = Date.now();
    order.cancellationReason = req.body.reason || 'Customer request';

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity }
      });
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/orders/admin/all
 * @desc    Get all orders (Admin)
 * @access  Private/Admin
 */
router.get('/admin/all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = status ? { orderStatus: status } : {};
    const skip = (page - 1) * limit;

    const orders = await Order.find(query)
      .populate('user', 'firstName lastName email')
      .sort('-createdAt')
      .skip(skip)
      .limit(Number(limit));

    const total = await Order.countDocuments(query);

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
 * @route   PUT /api/orders/:id/status
 * @desc    Update order status (Admin)
 * @access  Private/Admin
 */
router.put(
  '/:id/status',
  protect,
  authorize('admin'),
  [
    body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Invalid status'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { status, trackingNumber } = req.body;

      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      order.orderStatus = status;
      if (trackingNumber) order.trackingNumber = trackingNumber;
      if (status === 'delivered') order.deliveredAt = Date.now();

      await order.save();

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

module.exports = router;