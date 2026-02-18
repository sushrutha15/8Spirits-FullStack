const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  // Date tracking
  date: {
    type: Date,
    required: true
  },
  dateString: {
    type: String,
    required: true // Format: YYYY-MM-DD
  },
  
  // Sales Metrics
  sales: {
    totalRevenue: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    totalItems: { type: Number, default: 0 },
    totalDiscounts: { type: Number, default: 0 },
    totalRefunds: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },
    
    // By status
    pendingOrders: { type: Number, default: 0 },
    processingOrders: { type: Number, default: 0 },
    shippedOrders: { type: Number, default: 0 },
    deliveredOrders: { type: Number, default: 0 },
    cancelledOrders: { type: Number, default: 0 },
    
    // Payment status
    paidOrders: { type: Number, default: 0 },
    unpaidOrders: { type: Number, default: 0 },
    failedPayments: { type: Number, default: 0 }
  },

  // Customer Metrics
  customers: {
    newCustomers: { type: Number, default: 0 },
    returningCustomers: { type: Number, default: 0 },
    totalActiveCustomers: { type: Number, default: 0 },
    
    // Lifetime value
    averageLifetimeValue: { type: Number, default: 0 },
    
    // Retention
    retentionRate: { type: Number, default: 0 },
    churnRate: { type: Number, default: 0 }
  },

  // Product Metrics
  products: {
    totalProductsSold: { type: Number, default: 0 },
    uniqueProductsSold: { type: Number, default: 0 },
    averageProductsPerOrder: { type: Number, default: 0 },
    
    // Top performers
    topSellingProducts: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      quantitySold: Number,
      revenue: Number
    }],
    
    lowStockProducts: { type: Number, default: 0 },
    outOfStockProducts: { type: Number, default: 0 }
  },

  // Category Performance
  categories: [{
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    revenue: Number,
    orderCount: Number,
    itemsSold: Number
  }],

  // Traffic Metrics
  traffic: {
    totalVisits: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    pageViews: { type: Number, default: 0 },
    averageSessionDuration: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
    
    // Sources
    sources: {
      direct: { type: Number, default: 0 },
      organic: { type: Number, default: 0 },
      social: { type: Number, default: 0 },
      email: { type: Number, default: 0 },
      referral: { type: Number, default: 0 },
      paid: { type: Number, default: 0 }
    },
    
    // Devices
    devices: {
      desktop: { type: Number, default: 0 },
      mobile: { type: Number, default: 0 },
      tablet: { type: Number, default: 0 }
    }
  },

  // Conversion Metrics
  conversion: {
    conversionRate: { type: Number, default: 0 },
    cartAbandonmentRate: { type: Number, default: 0 },
    checkoutAbandonmentRate: { type: Number, default: 0 },
    
    addToCartEvents: { type: Number, default: 0 },
    checkoutInitiated: { type: Number, default: 0 },
    ordersCompleted: { type: Number, default: 0 }
  },

  // Marketing Metrics
  marketing: {
    emailsSent: { type: Number, default: 0 },
    emailsOpened: { type: Number, default: 0 },
    emailsClicked: { type: Number, default: 0 },
    emailConversions: { type: Number, default: 0 },
    
    couponUsage: { type: Number, default: 0 },
    totalDiscountAmount: { type: Number, default: 0 },
    
    affiliateRevenue: { type: Number, default: 0 },
    affiliateOrders: { type: Number, default: 0 }
  },

  // Geographic Data
  geographic: [{
    state: String,
    orderCount: Number,
    revenue: Number,
    averageOrderValue: Number
  }],

  // Inventory Metrics
  inventory: {
    totalStockValue: { type: Number, default: 0 },
    lowStockAlerts: { type: Number, default: 0 },
    stockOuts: { type: Number, default: 0 },
    inventoryTurnover: { type: Number, default: 0 }
  },

  // Subscription Metrics
  subscriptions: {
    activeSubscriptions: { type: Number, default: 0 },
    newSubscriptions: { type: Number, default: 0 },
    cancelledSubscriptions: { type: Number, default: 0 },
    subscriptionRevenue: { type: Number, default: 0 },
    churnRate: { type: Number, default: 0 },
    mrr: { type: Number, default: 0 } // Monthly Recurring Revenue
  },

  // Review Metrics
  reviews: {
    totalReviews: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    reviewsWithImages: { type: Number, default: 0 }
  },

  // Shipping Metrics
  shipping: {
    totalShippingRevenue: { type: Number, default: 0 },
    averageShippingCost: { type: Number, default: 0 },
    freeShippingOrders: { type: Number, default: 0 },
    averageDeliveryTime: { type: Number, default: 0 },
    lateDeliveries: { type: Number, default: 0 }
  },

  // Period type
  periodType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    default: 'daily'
  }

}, {
  timestamps: true
});

// Indexes
analyticsSchema.index({ dateString: 1, periodType: 1 }, { unique: true });
analyticsSchema.index({ date: -1 });
analyticsSchema.index({ periodType: 1, date: -1 });

// Generate analytics for a specific date
analyticsSchema.statics.generateDailyAnalytics = async function(date) {
  const Order = mongoose.model('Order');
  const User = mongoose.model('User');
  const Product = mongoose.model('Product');
  const Review = mongoose.model('Review');

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get orders for the day
  const orders = await Order.find({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  }).populate('user items.product');

  // Calculate sales metrics
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = orders.length;
  const totalDiscounts = orders.reduce((sum, order) => sum + (order.discount || 0), 0);
  const totalRefunds = orders.filter(o => o.paymentStatus === 'refunded').reduce((sum, o) => sum + o.total, 0);

  // Get new customers
  const newCustomers = await User.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });

  // Get top selling products
  const productSales = {};
  orders.forEach(order => {
    order.items.forEach(item => {
      const productId = item.product._id.toString();
      if (!productSales[productId]) {
        productSales[productId] = {
          product: item.product._id,
          quantitySold: 0,
          revenue: 0
        };
      }
      productSales[productId].quantitySold += item.quantity;
      productSales[productId].revenue += item.price * item.quantity;
    });
  });

  const topSellingProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Get stock metrics
  const lowStockProducts = await Product.countDocuments({
    stock: { $gt: 0, $lte: 10 }
  });
  const outOfStockProducts = await Product.countDocuments({ stock: 0 });

  // Get reviews
  const totalReviews = await Review.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });

  const dateString = date.toISOString().split('T')[0];

  // Create or update analytics
  const analytics = await this.findOneAndUpdate(
    { dateString, periodType: 'daily' },
    {
      date,
      dateString,
      periodType: 'daily',
      sales: {
        totalRevenue,
        totalOrders,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        totalDiscounts,
        totalRefunds,
        netRevenue: totalRevenue - totalRefunds,
        paidOrders: orders.filter(o => o.paymentStatus === 'paid').length,
        deliveredOrders: orders.filter(o => o.orderStatus === 'delivered').length
      },
      customers: {
        newCustomers
      },
      products: {
        topSellingProducts,
        lowStockProducts,
        outOfStockProducts
      },
      reviews: {
        totalReviews
      }
    },
    { upsert: true, new: true }
  );

  return analytics;
};

module.exports = mongoose.model('Analytics', analyticsSchema);