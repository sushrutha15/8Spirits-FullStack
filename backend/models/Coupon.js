const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,

  // Discount Configuration
  discountType: {
    type: String,
    enum: ['percentage', 'fixed', 'free_shipping', 'buy_x_get_y', 'tiered'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  maxDiscountAmount: Number, // For percentage discounts

  // Buy X Get Y Configuration
  buyXGetY: {
    buyQuantity: Number,
    getQuantity: Number,
    applyTo: {
      type: String,
      enum: ['same_product', 'specific_products', 'cheapest', 'any']
    },
    products: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }]
  },

  // Tiered Discounts
  tiers: [{
    minAmount: Number,
    discountValue: Number,
    discountType: String
  }],

  // Usage Limits
  usageLimit: {
    type: Number,
    default: null // null = unlimited
  },
  usageCount: {
    type: Number,
    default: 0
  },
  usageLimitPerUser: {
    type: Number,
    default: 1
  },
  
  // Minimum Requirements
  minimumPurchaseAmount: {
    type: Number,
    default: 0
  },
  minimumQuantity: {
    type: Number,
    default: 0
  },

  // Applicable To
  applicableToEntireOrder: {
    type: Boolean,
    default: true
  },
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  applicableBrands: [String],
  excludedProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  excludedCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],

  // Customer Restrictions
  applicableToAllCustomers: {
    type: Boolean,
    default: true
  },
  applicableCustomers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  applicableCustomerGroups: [String],
  minCustomerLifetimeValue: Number,
  firstOrderOnly: Boolean,
  newCustomersOnly: Boolean,

  // Validity Period
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: Date,
  
  // Active Days (e.g., only weekends)
  activeDays: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  }],
  
  // Active Hours
  activeHours: {
    start: String, // HH:mm format
    end: String
  },

  // Combination Rules
  canCombineWithOtherCoupons: {
    type: Boolean,
    default: false
  },
  canCombineWithSaleItems: {
    type: Boolean,
    default: true
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isAutoApplied: {
    type: Boolean,
    default: false
  },

  // Marketing
  campaignName: String,
  affiliateCode: String,
  referralSource: String,

  // Usage Tracking
  usedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    usedAt: Date,
    discountAmount: Number
  }],

  // Analytics
  totalRevenue: {
    type: Number,
    default: 0
  },
  totalDiscountGiven: {
    type: Number,
    default: 0
  },
  conversionRate: Number,

  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Metadata
  tags: [String],
  metadata: mongoose.Schema.Types.Mixed

}, {
  timestamps: true
});

// Indexes
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, endDate: 1 });
couponSchema.index({ startDate: 1, endDate: 1 });

// Check if coupon is valid
couponSchema.methods.isValid = function() {
  const now = Date.now();
  
  // Check active status
  if (!this.isActive) return { valid: false, reason: 'Coupon is inactive' };
  
  // Check dates
  if (this.startDate && this.startDate > now) {
    return { valid: false, reason: 'Coupon not yet active' };
  }
  if (this.endDate && this.endDate < now) {
    return { valid: false, reason: 'Coupon has expired' };
  }
  
  // Check usage limit
  if (this.usageLimit && this.usageCount >= this.usageLimit) {
    return { valid: false, reason: 'Coupon usage limit reached' };
  }
  
  return { valid: true };
};

// Check if coupon is valid for user
couponSchema.methods.isValidForUser = function(userId, userOrders = []) {
  // Check if user has exceeded per-user limit
  const userUsageCount = this.usedBy.filter(
    usage => usage.user.toString() === userId.toString()
  ).length;
  
  if (this.usageLimitPerUser && userUsageCount >= this.usageLimitPerUser) {
    return { valid: false, reason: 'You have already used this coupon' };
  }
  
  // Check if first order only
  if (this.firstOrderOnly && userOrders.length > 0) {
    return { valid: false, reason: 'This coupon is only for first-time customers' };
  }
  
  // Check if new customers only
  if (this.newCustomersOnly) {
    const accountAge = Date.now() - new Date(userId.createdAt).getTime();
    const daysSinceSignup = accountAge / (1000 * 60 * 60 * 24);
    if (daysSinceSignup > 30) {
      return { valid: false, reason: 'This coupon is only for new customers' };
    }
  }
  
  return { valid: true };
};

// Calculate discount for cart
couponSchema.methods.calculateDiscount = function(cart) {
  let discountAmount = 0;
  
  switch (this.discountType) {
    case 'percentage':
      discountAmount = (cart.subtotal * this.discountValue) / 100;
      if (this.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, this.maxDiscountAmount);
      }
      break;
      
    case 'fixed':
      discountAmount = this.discountValue;
      break;
      
    case 'free_shipping':
      discountAmount = cart.shippingCost || 0;
      break;
      
    case 'tiered':
      const applicableTier = this.tiers
        .filter(tier => cart.subtotal >= tier.minAmount)
        .sort((a, b) => b.minAmount - a.minAmount)[0];
      
      if (applicableTier) {
        if (applicableTier.discountType === 'percentage') {
          discountAmount = (cart.subtotal * applicableTier.discountValue) / 100;
        } else {
          discountAmount = applicableTier.discountValue;
        }
      }
      break;
  }
  
  // Ensure discount doesn't exceed cart total
  return Math.min(discountAmount, cart.subtotal);
};

// Record usage
couponSchema.methods.recordUsage = async function(userId, orderId, discountAmount) {
  this.usageCount += 1;
  this.totalDiscountGiven += discountAmount;
  
  this.usedBy.push({
    user: userId,
    order: orderId,
    usedAt: Date.now(),
    discountAmount
  });
  
  await this.save();
};

module.exports = mongoose.model('Coupon', couponSchema);