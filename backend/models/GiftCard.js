const mongoose = require('mongoose');
const crypto = require('crypto');

const giftCardSchema = new mongoose.Schema({
  // Card Details
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  pin: {
    type: String,
    select: false
  },

  // Value
  initialValue: {
    type: Number,
    required: true,
    min: 0
  },
  currentBalance: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'redeemed', 'expired', 'cancelled', 'suspended'],
    default: 'active'
  },

  // Purchaser Information
  purchasedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  purchaseOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },

  // Recipient Information
  recipientEmail: String,
  recipientName: String,
  recipientPhone: String,
  
  // Gift Message
  message: String,
  senderName: String,

  // Delivery
  deliveryMethod: {
    type: String,
    enum: ['email', 'sms', 'physical', 'immediate'],
    default: 'email'
  },
  deliveryDate: Date,
  deliveryStatus: {
    type: String,
    enum: ['pending', 'scheduled', 'sent', 'delivered', 'failed'],
    default: 'pending'
  },
  sentAt: Date,

  // Design
  design: {
    template: String,
    backgroundColor: String,
    image: String
  },

  // Usage
  usedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    amount: Number,
    usedAt: Date,
    remainingBalance: Number
  }],

  // Restrictions
  restrictions: {
    minimumPurchase: Number,
    applicableCategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    applicableProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    excludedProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    canCombineWithCoupons: { type: Boolean, default: true },
    canCombineWithSale: { type: Boolean, default: true }
  },

  // Validity
  activationDate: {
    type: Date,
    default: Date.now
  },
  expirationDate: Date,
  neverExpires: {
    type: Boolean,
    default: false
  },

  // Reloadable
  isReloadable: {
    type: Boolean,
    default: false
  },
  reloadHistory: [{
    amount: Number,
    reloadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reloadedAt: Date,
    transactionId: String
  }],

  // Security
  lastCheckedAt: Date,
  lastUsedAt: Date,
  checkCount: {
    type: Number,
    default: 0
  },
  suspiciousActivity: Boolean,

  // Notes
  internalNotes: String,
  customerNotes: String,

  // Metadata
  source: String, // website, pos, mobile
  campaign: String,
  tags: [String],
  metadata: mongoose.Schema.Types.Mixed

}, {
  timestamps: true
});

// Indexes
giftCardSchema.index({ code: 1 });
giftCardSchema.index({ status: 1 });
giftCardSchema.index({ purchasedBy: 1 });
giftCardSchema.index({ recipientEmail: 1 });
giftCardSchema.index({ expirationDate: 1 });

// Generate unique code
giftCardSchema.statics.generateCode = function() {
  const code = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `GC${code}`;
};

// Generate PIN
giftCardSchema.statics.generatePIN = function() {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Check if gift card is valid
giftCardSchema.methods.isValid = function() {
  // Check status
  if (this.status !== 'active') {
    return { valid: false, reason: `Gift card is ${this.status}` };
  }

  // Check balance
  if (this.currentBalance <= 0) {
    return { valid: false, reason: 'Gift card has no remaining balance' };
  }

  // Check activation date
  if (this.activationDate && this.activationDate > Date.now()) {
    return { valid: false, reason: 'Gift card is not yet active' };
  }

  // Check expiration
  if (!this.neverExpires && this.expirationDate && this.expirationDate < Date.now()) {
    this.status = 'expired';
    this.save();
    return { valid: false, reason: 'Gift card has expired' };
  }

  return { valid: true };
};

// Use gift card
giftCardSchema.methods.use = async function(amount, userId, orderId) {
  const validation = this.isValid();
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  if (amount > this.currentBalance) {
    throw new Error('Insufficient gift card balance');
  }

  this.currentBalance -= amount;
  this.lastUsedAt = Date.now();

  this.usedBy.push({
    user: userId,
    order: orderId,
    amount,
    usedAt: Date.now(),
    remainingBalance: this.currentBalance
  });

  // Update status if fully redeemed
  if (this.currentBalance === 0) {
    this.status = 'redeemed';
  }

  await this.save();
  return this.currentBalance;
};

// Reload gift card
giftCardSchema.methods.reload = async function(amount, userId, transactionId) {
  if (!this.isReloadable) {
    throw new Error('This gift card is not reloadable');
  }

  this.currentBalance += amount;
  
  this.reloadHistory.push({
    amount,
    reloadedBy: userId,
    reloadedAt: Date.now(),
    transactionId
  });

  if (this.status === 'redeemed') {
    this.status = 'active';
  }

  await this.save();
  return this.currentBalance;
};

// Check balance
giftCardSchema.methods.checkBalance = async function() {
  this.lastCheckedAt = Date.now();
  this.checkCount += 1;
  await this.save();
  return this.currentBalance;
};

module.exports = mongoose.model('GiftCard', giftCardSchema);