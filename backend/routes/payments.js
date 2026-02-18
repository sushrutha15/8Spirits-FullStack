const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect } = require('../middleware/auth');
const { Order } = require('../models/index');
const {
  createPaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  createRefund
} = require('../utils/payment');

/**
 * @route   POST /api/payments/create-intent
 * @desc    Create payment intent for order
 * @access  Private
 */
router.post(
  '/create-intent',
  protect,
  [
    body('orderId').notEmpty().withMessage('Order ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { orderId } = req.body;

      // Get order
      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Verify ownership
      if (order.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized'
        });
      }

      // Check if already paid
      if (order.paymentStatus === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Order already paid'
        });
      }

      // Create payment intent
      const paymentIntent = await createPaymentIntent(
        order.total,
        'usd',
        {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          userId: req.user.id
        }
      );

      // Save payment intent ID to order
      order.stripePaymentIntentId = paymentIntent.id;
      await order.save();

      res.status(200).json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/payments/confirm
 * @desc    Confirm payment
 * @access  Private
 */
router.post(
  '/confirm',
  protect,
  [
    body('paymentIntentId').notEmpty().withMessage('Payment intent ID is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { paymentIntentId } = req.body;

      // Retrieve payment intent
      const paymentIntent = await retrievePaymentIntent(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({
          success: false,
          message: 'Payment not successful',
          status: paymentIntent.status
        });
      }

      // Update order
      const order = await Order.findOne({ stripePaymentIntentId: paymentIntentId });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      order.paymentStatus = 'paid';
      order.orderStatus = 'confirmed';
      await order.save();

      res.status(200).json({
        success: true,
        message: 'Payment confirmed successfully',
        data: { order }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/payments/refund
 * @desc    Process refund
 * @access  Private/Admin
 */
router.post(
  '/refund',
  protect,
  [
    body('orderId').notEmpty().withMessage('Order ID is required'),
    body('amount').optional().isNumeric(),
    validate
  ],
  async (req, res, next) => {
    try {
      const { orderId, amount, reason } = req.body;

      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      if (order.paymentStatus !== 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Order has not been paid'
        });
      }

      if (!order.stripePaymentIntentId) {
        return res.status(400).json({
          success: false,
          message: 'No payment intent found for this order'
        });
      }

      // Create refund
      const refund = await createRefund(
        order.stripePaymentIntentId,
        amount || order.total
      );

      // Update order
      order.paymentStatus = 'refunded';
      order.orderStatus = 'cancelled';
      order.cancellationReason = reason || 'Refund processed';
      await order.save();

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          refund,
          order
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/payments/order/:orderId
 * @desc    Get payment status for order
 * @access  Private
 */
router.get('/order/:orderId', protect, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify ownership
    if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    let paymentDetails = null;
    if (order.stripePaymentIntentId) {
      paymentDetails = await retrievePaymentIntent(order.stripePaymentIntentId);
    }

    res.status(200).json({
      success: true,
      data: {
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        amount: order.total,
        paymentDetails
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;