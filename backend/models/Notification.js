const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Notification Details
  type: {
    type: String,
    enum: [
      'order_placed',
      'order_confirmed',
      'order_shipped',
      'order_delivered',
      'order_cancelled',
      'payment_successful',
      'payment_failed',
      'refund_processed',
      'product_back_in_stock',
      'price_drop',
      'review_reminder',
      'subscription_renewal',
      'subscription_failed',
      'promotion',
      'newsletter',
      'account_security',
      'wishlist_sale',
      'abandoned_cart',
      'loyalty_points',
      'birthday',
      'system',
      'other'
    ],
    required: true
  },

  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },

  // Related Entities
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },

  // Delivery Channels
  channels: [{
    type: String,
    enum: ['email', 'sms', 'push', 'in_app'],
    required: true
  }],

  // Delivery Status
  deliveryStatus: {
    email: {
      sent: Boolean,
      sentAt: Date,
      opened: Boolean,
      openedAt: Date,
      clicked: Boolean,
      clickedAt: Date,
      bounced: Boolean,
      error: String
    },
    sms: {
      sent: Boolean,
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      error: String
    },
    push: {
      sent: Boolean,
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      opened: Boolean,
      openedAt: Date,
      error: String
    },
    inApp: {
      displayed: Boolean,
      displayedAt: Date
    }
  },

  // User Interaction
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  archived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,

  // Action
  actionUrl: String,
  actionText: String,
  actionData: mongoose.Schema.Types.Mixed,

  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },

  // Scheduling
  scheduledFor: Date,
  expiresAt: Date,

  // Rich Content
  image: String,
  icon: String,
  color: String,

  // Metadata
  campaign: String,
  tags: [String],
  metadata: mongoose.Schema.Types.Mixed

}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 });

// Mark as read
notificationSchema.methods.markAsRead = async function() {
  this.read = true;
  this.readAt = Date.now();
  await this.save();
};

// Archive notification
notificationSchema.methods.archive = async function() {
  this.archived = true;
  this.archivedAt = Date.now();
  await this.save();
};

// Check if expired
notificationSchema.methods.isExpired = function() {
  return this.expiresAt && this.expiresAt < Date.now();
};

module.exports = mongoose.model('Notification', notificationSchema);