const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Subscription Details
  name: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'cancelled', 'expired', 'pending', 'failed'],
    default: 'active'
  },

  // Products
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variant: mongoose.Schema.Types.ObjectId,
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: Number,
    discountPercentage: Number
  }],

  // Frequency
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannually', 'annually'],
    required: true
  },
  customFrequencyDays: Number, // For custom frequencies

  // Dates
  startDate: {
    type: Date,
    default: Date.now
  },
  nextBillingDate: {
    type: Date,
    required: true
  },
  endDate: Date,
  pausedUntil: Date,
  cancelledAt: Date,

  // Billing
  billingAddress: {
    firstName: String,
    lastName: String,
    address1: String,
    address2: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    phone: String
  },
  shippingAddress: {
    firstName: String,
    lastName: String,
    address1: String,
    address2: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    phone: String,
    instructions: String
  },

  // Payment
  paymentMethod: {
    type: String,
    required: true
  },
  stripeSubscriptionId: String,
  stripeCustomerId: String,
  paymentMethodId: String,

  // Pricing
  subtotal: {
    type: Number,
    required: true
  },
  tax: Number,
  shippingCost: Number,
  discount: Number,
  total: {
    type: Number,
    required: true
  },

  // Discount
  appliedCoupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon'
  },
  permanentDiscount: Number, // Permanent subscriber discount

  // Orders
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  totalOrders: {
    type: Number,
    default: 0
  },
  successfulOrders: {
    type: Number,
    default: 0
  },
  failedOrders: {
    type: Number,
    default: 0
  },

  // Next Order
  nextOrderDate: Date,
  skipNextOrder: Boolean,

  // Failed Payment Handling
  failedPaymentAttempts: {
    type: Number,
    default: 0
  },
  lastFailedPaymentDate: Date,
  lastFailedPaymentReason: String,

  // Cancellation
  cancellationReason: String,
  cancellationFeedback: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Modifications History
  modificationsHistory: [{
    modifiedAt: Date,
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changes: mongoose.Schema.Types.Mixed,
    reason: String
  }],

  // Preferences
  preferences: {
    autoRenew: { type: Boolean, default: true },
    sendReminders: { type: Boolean, default: true },
    reminderDaysBefore: { type: Number, default: 3 },
    allowSubstitutions: { type: Boolean, default: false },
    notifyOnShipment: { type: Boolean, default: true }
  },

  // Analytics
  totalRevenue: {
    type: Number,
    default: 0
  },
  averageOrderValue: Number,
  lifetimeValue: Number,

  // Metadata
  source: String, // web, mobile, phone
  tags: [String],
  notes: String,
  metadata: mongoose.Schema.Types.Mixed

}, {
  timestamps: true
});

// Indexes
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ nextBillingDate: 1, status: 1 });
subscriptionSchema.index({ status: 1 });

// Calculate next billing date
subscriptionSchema.methods.calculateNextBillingDate = function() {
  const currentDate = this.nextBillingDate || new Date();
  let nextDate = new Date(currentDate);

  switch (this.frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'biweekly':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'bimonthly':
      nextDate.setMonth(nextDate.getMonth() + 2);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'semiannually':
      nextDate.setMonth(nextDate.getMonth() + 6);
      break;
    case 'annually':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    default:
      if (this.customFrequencyDays) {
        nextDate.setDate(nextDate.getDate() + this.customFrequencyDays);
      }
  }

  return nextDate;
};

// Pause subscription
subscriptionSchema.methods.pause = async function(durationDays) {
  this.status = 'paused';
  this.pausedUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  await this.save();
};

// Resume subscription
subscriptionSchema.methods.resume = async function() {
  this.status = 'active';
  this.pausedUntil = null;
  await this.save();
};

// Cancel subscription
subscriptionSchema.methods.cancel = async function(reason, userId) {
  this.status = 'cancelled';
  this.cancelledAt = Date.now();
  this.cancellationReason = reason;
  this.cancelledBy = userId;
  await this.save();
};

// Process billing
subscriptionSchema.methods.processBilling = async function() {
  try {
    // Create order from subscription
    const Order = mongoose.model('Order');
    
    const order = await Order.create({
      user: this.user,
      items: this.items,
      subtotal: this.subtotal,
      tax: this.tax,
      shippingCost: this.shippingCost,
      discount: this.discount,
      total: this.total,
      shippingAddress: this.shippingAddress,
      billingAddress: this.billingAddress,
      paymentMethod: this.paymentMethod,
      isSubscription: true,
      subscriptionId: this._id,
      subscriptionCycle: this.totalOrders + 1
    });

    // Update subscription
    this.orders.push(order._id);
    this.totalOrders += 1;
    this.successfulOrders += 1;
    this.totalRevenue += this.total;
    this.nextBillingDate = this.calculateNextBillingDate();
    this.failedPaymentAttempts = 0;

    await this.save();

    return { success: true, order };
  } catch (error) {
    this.failedOrders += 1;
    this.failedPaymentAttempts += 1;
    this.lastFailedPaymentDate = Date.now();
    this.lastFailedPaymentReason = error.message;

    // Suspend after 3 failed attempts
    if (this.failedPaymentAttempts >= 3) {
      this.status = 'failed';
    }

    await this.save();

    return { success: false, error: error.message };
  }
};

module.exports = mongoose.model('Subscription', subscriptionSchema);