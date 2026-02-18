const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'vendor', 'support', 'warehouse'],
    default: 'user'
  },
  phone: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  avatar: {
    type: String,
    default: null
  },
  
  // Address Management
  addresses: [{
    type: {
      type: String,
      enum: ['home', 'work', 'other'],
      default: 'home'
    },
    firstName: String,
    lastName: String,
    address1: { type: String, required: true },
    address2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, default: 'USA' },
    phone: String,
    isDefault: { type: Boolean, default: false }
  }],

  // Wishlist
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],

  // Enhanced Loyalty Program
  loyaltyPoints: {
    points: { type: Number, default: 0 },
    totalPointsEarned: { type: Number, default: 0 },
    totalPointsRedeemed: { type: Number, default: 0 },
    tier: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'], default: 'bronze' },
    tierHistory: [{
      tier: String,
      earnedAt: Date,
      reason: String
    }],
    pointsHistory: [{
      type: { type: String, enum: ['earned', 'redeemed', 'bonus', 'deducted'] },
      points: Number,
      description: String,
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
      date: Date
    }],
    rewards: [{
      rewardId: String,
      name: String,
      description: String,
      claimedAt: Date,
      usedAt: Date,
      expiresAt: Date,
      status: { type: String, enum: ['available', 'used', 'expired'], default: 'available' }
    }],
    referralCode: String,
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  // Simple Loyalty (kept for backward compatibility)
  loyaltyPointsSimple: {
    type: Number,
    default: 0
  },

  // Shopping Preferences
  preferences: {
    favoriteCategories: [String],
    priceRange: {
      min: Number,
      max: Number
    },
    favoriteSpirits: [String],
    newsletter: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true }
  },

  // Age Verification
  ageVerified: {
    type: Boolean,
    default: false
  },
  ageVerificationDate: Date,
  
  // Payment Methods
  paymentMethods: [{
    type: {
      type: String,
      enum: ['card', 'paypal', 'apple_pay', 'google_pay']
    },
    last4: String,
    brand: String,
    expiryMonth: Number,
    expiryYear: Number,
    isDefault: { type: Boolean, default: false },
    stripePaymentMethodId: String
  }],

  // Social Login
  googleId: String,
  facebookId: String,
  appleId: String,
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook', 'apple'],
    default: 'local'
  },

  // Stripe Customer ID
  stripeCustomerId: String,

  // Device Tokens for Push Notifications
  deviceTokens: [{
    token: String,
    type: { type: String, enum: ['ios', 'android', 'web'] },
    addedAt: Date
  }],

  // Account Status
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  accountLockedUntil: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  // Activity Tracking
  lastLogin: Date,
  lastPasswordChange: Date,
  totalOrders: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },

  // Tokens
  resetPasswordToken: String,
  resetPasswordExpiry: Date,
  verificationToken: String,
  refreshToken: String,

  // Metadata
  metadata: {
    registrationSource: String,
    referralCode: String,
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ loyaltyTier: 1 });
userSchema.index({ 'addresses.zipCode': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for age
userSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.lastPasswordChange = Date.now();
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      role: this.role,
      loyaltyTier: this.loyaltyTier 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Generate refresh token
userSchema.methods.generateRefreshToken = function() {
  const refreshToken = jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  this.refreshToken = refreshToken;
  return refreshToken;
};

// Generate password reset token
userSchema.methods.generateResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Generate email verification token
userSchema.methods.generateVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  this.verificationTokenExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Update loyalty tier based on total spent
userSchema.methods.updateLoyaltyTier = function() {
  if (this.totalSpent >= 5000) {
    this.loyaltyTier = 'platinum';
  } else if (this.totalSpent >= 2000) {
    this.loyaltyTier = 'gold';
  } else if (this.totalSpent >= 500) {
    this.loyaltyTier = 'silver';
  } else {
    this.loyaltyTier = 'bronze';
  }
};

// Add loyalty points
userSchema.methods.addLoyaltyPoints = function(amount) {
  const pointsRate = {
    bronze: 1,
    silver: 1.5,
    gold: 2,
    platinum: 2.5
  };
  
  const rate = pointsRate[this.loyaltyTier] || 1;
  this.loyaltyPoints += Math.floor(amount * rate);
};

// Check if account is locked
userSchema.methods.isAccountLocked = function() {
  return this.accountLockedUntil && this.accountLockedUntil > Date.now();
};

// Lock account
userSchema.methods.lockAccount = function(duration = 30 * 60 * 1000) {
  this.accountLockedUntil = Date.now() + duration;
};

