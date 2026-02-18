const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Customer Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerInfo: {
    email: String,
    phone: String,
    firstName: String,
    lastName: String
  },

  // Order Items
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variant: {
      type: mongoose.Schema.Types.ObjectId
    },
    name: String,
    sku: String,
    image: String,
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    originalPrice: Number,
    discount: Number,
    tax: Number,
    subtotal: Number,
    
    // Gift Options
    isGift: Boolean,
    giftMessage: String,
    giftWrap: Boolean,
    giftWrapPrice: Number,

    // Product snapshot at time of order
    specifications: {
      alcoholContent: Number,
      volume: Number,
      type: String
    }
  }],

  // Pricing
  subtotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    default: 0
  },
  taxRate: Number,
  shippingCost: {
    type: Number,
    default: 0
  },
  handlingFee: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  discountCodes: [{
    code: String,
    amount: Number,
    type: String // 'percentage' or 'fixed'
  }],
  giftCardAmount: {
    type: Number,
    default: 0
  },
  loyaltyPointsUsed: {
    type: Number,
    default: 0
  },
  loyaltyPointsValue: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },

  // Addresses
  shippingAddress: {
    firstName: String,
    lastName: String,
    company: String,
    address1: String,
    address2: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    phone: String,
    email: String,
    instructions: String
  },
  billingAddress: {
    firstName: String,
    lastName: String,
    company: String,
    address1: String,
    address2: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    phone: String,
    email: String
  },

  // Shipping Information
  shippingMethod: {
    name: String,
    carrier: String,
    service: String, // 'standard', 'express', 'overnight'
    estimatedDays: Number,
    trackingAvailable: Boolean
  },
  trackingNumber: String,
  trackingUrl: String,
  shipments: [{
    trackingNumber: String,
    carrier: String,
    shippedDate: Date,
    estimatedDelivery: Date,
    actualDelivery: Date,
    items: [{
      product: mongoose.Schema.Types.ObjectId,
      quantity: Number
    }]
  }],

  // Payment Information
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay', 'stripe', 'cash_on_delivery', 'bank_transfer', 'gift_card'],
    required: true
  },
  paymentDetails: {
    last4: String,
    brand: String, // Visa, Mastercard, etc.
    expiryMonth: Number,
    expiryYear: Number
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'authorized', 'paid', 'partially_paid', 'failed', 'refunded', 'partially_refunded', 'cancelled'],
    default: 'pending'
  },
  
  // Payment Gateway Info
  stripePaymentIntentId: String,
  stripeChargeId: String,
  paypalTransactionId: String,
  
  // Transactions
  transactions: [{
    type: {
      type: String,
      enum: ['payment', 'refund', 'chargeback']
    },
    amount: Number,
    status: String,
    transactionId: String,
    gateway: String,
    date: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }],

  // Order Status
  orderStatus: {
    type: String,
    enum: [
      'pending',           // Order placed, awaiting payment
      'payment_failed',    // Payment failed
      'paid',             // Payment successful
      'processing',       // Being prepared
      'awaiting_pickup',  // Ready for carrier pickup
      'picked',           // Picked from warehouse
      'packed',           // Packed and ready
      'shipped',          // Shipped
      'in_transit',       // In delivery
      'out_for_delivery', // Out for delivery
      'delivered',        // Successfully delivered
      'attempted_delivery', // Delivery attempted
      'exception',        // Shipping exception
      'returned',         // Returned by customer
      'cancelled',        // Cancelled
      'on_hold',          // On hold
      'refunded'          // Refunded
    ],
    default: 'pending'
  },
  
  fulfillmentStatus: {
    type: String,
    enum: ['unfulfilled', 'partially_fulfilled', 'fulfilled', 'restocked'],
    default: 'unfulfilled'
  },

  // Status History
  statusHistory: [{
    status: String,
    note: String,
    timestamp: { type: Date, default: Date.now },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // Age Verification
  ageVerificationRequired: {
    type: Boolean,
    default: true
  },
  ageVerified: {
    type: Boolean,
    default: false
  },
  ageVerificationMethod: String,
  ageVerificationDate: Date,

  // Delivery Preferences
  deliveryPreferences: {
    leaveAtDoor: Boolean,
    requireSignature: { type: Boolean, default: true },
    preferredDeliveryDate: Date,
    preferredDeliveryTime: String,
    deliveryInstructions: String
  },

  // Notes
  customerNotes: String,
  internalNotes: String,
  adminNotes: String,

  // Source
  source: {
    type: String,
    enum: ['web', 'mobile', 'pos', 'phone', 'email'],
    default: 'web'
  },
  device: String,
  ipAddress: String,
  userAgent: String,

  // Marketing
  utmSource: String,
  utmMedium: String,
  utmCampaign: String,
  referralCode: String,

  // Dates
  placedAt: {
    type: Date,
    default: Date.now
  },
  paidAt: Date,
  processedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  refundedAt: Date,
  estimatedDeliveryDate: Date,

  // Cancellation
  cancellationReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Returns
  returnRequested: Boolean,
  returnReason: String,
  returnStatus: {
    type: String,
    enum: ['none', 'requested', 'approved', 'rejected', 'received', 'refunded']
  },
  returnDate: Date,

  // Invoice
  invoiceNumber: String,
  invoiceUrl: String,
  invoiceGenerated: Boolean,

  // Gift Options
  isGift: Boolean,
  giftMessage: String,

  // Subscription (for recurring orders)
  isSubscription: Boolean,
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  subscriptionCycle: Number,

  // Ratings
  customerRating: {
    overall: Number,
    delivery: Number,
    packaging: Number,
    rated: Boolean,
    ratedAt: Date
  },

  // Warehouse
  warehouse: String,
  pickingList: String,
  packingList: String,

  // Risk Assessment
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  fraudScore: Number,
  fraudChecks: {
    addressVerification: Boolean,
    cvvCheck: Boolean,
    velocityCheck: Boolean
  },

  // Notifications
  notifications: [{
    type: String,
    sentAt: Date,
    channel: String, // email, sms, push
    status: String
  }],

  // Metadata
  tags: [String],
  metadata: mongoose.Schema.Types.Mixed

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'shippingAddress.zipCode': 1 });
orderSchema.index({ trackingNumber: 1 });

// Generate order number
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    this.orderNumber = `8S${year}${month}${day}${random}`;
  }
  next();
});

// Virtual for days since order
orderSchema.virtual('daysSinceOrder').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
orderSchema.virtual('isOverdue').get(function() {
  if (!this.estimatedDeliveryDate || this.orderStatus === 'delivered') return false;
  return Date.now() > this.estimatedDeliveryDate;
});

// Add status to history
orderSchema.methods.addStatusHistory = function(status, note, userId) {
  this.statusHistory.push({
    status,
    note,
    timestamp: Date.now(),
    updatedBy: userId
  });
};

// Check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  const cancellableStatuses = ['pending', 'paid', 'processing'];
  return cancellableStatuses.includes(this.orderStatus);
};

// Check if order can be returned
orderSchema.methods.canBeReturned = function() {
  if (this.orderStatus !== 'delivered') return false;
  const daysSinceDelivery = Math.floor((Date.now() - this.deliveredAt) / (1000 * 60 * 60 * 24));
  return daysSinceDelivery <= 30; // 30-day return window
};

// Calculate refund amount
orderSchema.methods.calculateRefundAmount = function(returnShipping = false) {
  let refundAmount = this.total;
  if (!returnShipping) {
    refundAmount -= this.shippingCost;
  }
  return refundAmount;
};

// FIXED EXPORT - Check if model exists before creating
module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);