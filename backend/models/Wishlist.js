const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variant: mongoose.Schema.Types.ObjectId,
    
    // Price tracking
    priceWhenAdded: Number,
    currentPrice: Number,
    priceDropAlert: {
      type: Boolean,
      default: true
    },
    targetPrice: Number,

    // Stock tracking
    inStockWhenAdded: Boolean,
    stockAlert: {
      type: Boolean,
      default: true
    },

    // Metadata
    addedAt: {
      type: Date,
      default: Date.now
    },
    notes: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    
    // Notifications sent
    priceDropNotified: Boolean,
    backInStockNotified: Boolean
  }],

  // List Details
  name: {
    type: String,
    default: 'My Wishlist'
  },
  description: String,
  
  // Privacy
  isPublic: {
    type: Boolean,
    default: false
  },
  shareUrl: String,

  // Analytics
  totalItemsAdded: {
    type: Number,
    default: 0
  },
  totalItemsRemoved: {
    type: Number,
    default: 0
  },
  totalItemsPurchased: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true
});

// Indexes
wishlistSchema.index({ user: 1 });
wishlistSchema.index({ 'items.product': 1 });

// Add item to wishlist
wishlistSchema.methods.addItem = async function(productId, priceWhenAdded) {
  const existingItem = this.items.find(
    item => item.product.toString() === productId.toString()
  );

  if (!existingItem) {
    this.items.push({
      product: productId,
      priceWhenAdded,
      currentPrice: priceWhenAdded,
      inStockWhenAdded: true,
      addedAt: Date.now()
    });
    this.totalItemsAdded += 1;
    await this.save();
    return { added: true };
  }

  return { added: false, message: 'Item already in wishlist' };
};

// Remove item from wishlist
wishlistSchema.methods.removeItem = async function(productId) {
  const initialLength = this.items.length;
  this.items = this.items.filter(
    item => item.product.toString() !== productId.toString()
  );

  if (this.items.length < initialLength) {
    this.totalItemsRemoved += 1;
    await this.save();
    return { removed: true };
  }

  return { removed: false, message: 'Item not found in wishlist' };
};

// Check for price drops
wishlistSchema.methods.checkPriceDrops = async function() {
  const Product = mongoose.model('Product');
  const priceDrops = [];

  for (const item of this.items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    const currentPrice = product.price;
    item.currentPrice = currentPrice;

    // Check if price has dropped
    if (
      item.priceDropAlert &&
      !item.priceDropNotified &&
      currentPrice < item.priceWhenAdded
    ) {
      const dropPercentage = ((item.priceWhenAdded - currentPrice) / item.priceWhenAdded * 100).toFixed(0);
      priceDrops.push({
        product,
        oldPrice: item.priceWhenAdded,
        newPrice: currentPrice,
        dropPercentage
      });
      item.priceDropNotified = true;
    }

    // Check if target price reached
    if (
      item.targetPrice &&
      currentPrice <= item.targetPrice &&
      !item.priceDropNotified
    ) {
      priceDrops.push({
        product,
        targetReached: true,
        targetPrice: item.targetPrice,
        currentPrice
      });
      item.priceDropNotified = true;
    }
  }

  await this.save();
  return priceDrops;
};

// Check for back in stock
wishlistSchema.methods.checkBackInStock = async function() {
  const Product = mongoose.model('Product');
  const backInStock = [];

  for (const item of this.items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    // Check if product is back in stock
    if (
      item.stockAlert &&
      !item.backInStockNotified &&
      product.stock > 0
    ) {
      backInStock.push({ product });
      item.backInStockNotified = true;
    }
  }

  await this.save();
  return backInStock;
};

module.exports = mongoose.model('Wishlist', wishlistSchema);