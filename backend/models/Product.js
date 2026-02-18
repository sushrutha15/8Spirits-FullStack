const mongoose = require('mongoose');
const slugify = require('slugify');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [500, 'Short description cannot exceed 500 characters']
  },

  // Pricing
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative']
  },
  compareAtPrice: {
    type: Number,
    min: [0, 'Compare price cannot be negative']
  },
  costPrice: {
    type: Number,
    min: [0, 'Cost price cannot be negative']
  },
  msrp: { // Manufacturer Suggested Retail Price
    type: Number
  },

  // Pricing Tiers (Bulk Discounts)
  pricingTiers: [{
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    discountPercentage: Number
  }],

  // Tax Information
  taxable: {
    type: Boolean,
    default: true
  },
  taxCode: String,

  // Categorization
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Product category is required']
  },
  subcategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  brand: {
    type: String,
    required: [true, 'Brand is required'],
    trim: true
  },
  manufacturer: String,

  // Inventory Management
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    unique: true,
    trim: true
  },
  barcode: String,
  upc: String,
  isbn: String,
  
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 10
  },
  trackInventory: {
    type: Boolean,
    default: true
  },
  
  // Warehouse locations
  warehouseLocations: [{
    warehouse: String,
    location: String,
    quantity: Number,
    reserved: { type: Number, default: 0 }
  }],

  // Product Variants (Size, Color, etc.)
  hasVariants: {
    type: Boolean,
    default: false
  },
  variants: [{
    name: String,
    sku: String,
    price: Number,
    stock: Number,
    attributes: {
      size: String,
      volume: Number,
      color: String,
      material: String
    },
    images: [String],
    isAvailable: { type: Boolean, default: true }
  }],

  // Images & Media
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    order: Number
  }],
  videos: [{
    url: String,
    thumbnail: String,
    title: String,
    duration: Number
  }],

  // Detailed Specifications for Spirits/Wine
  specifications: {
    alcoholContent: {
      type: Number,
      min: 0,
      max: 100
    },
    volume: {
      type: Number,
      required: true
    },
    vintage: Number,
    region: String,
    country: String,
    appellation: String,
    grapeVarietal: [String],
    
    type: {
      type: String,
      enum: ['whiskey', 'vodka', 'rum', 'gin', 'tequila', 'wine', 'beer', 'liqueur', 'cognac', 'brandy', 'champagne', 'sake', 'other']
    },
    subtype: String, // e.g., "Single Malt", "Cabernet Sauvignon"
    
    // Wine-specific
    wineColor: {
      type: String,
      enum: ['red', 'white', 'rose', 'sparkling', 'fortified']
    },
    sweetness: {
      type: String,
      enum: ['dry', 'off-dry', 'semi-sweet', 'sweet']
    },
    body: {
      type: String,
      enum: ['light', 'medium', 'full']
    },
    
    // Spirits-specific
    distillation: String,
    aging: String,
    ageStatement: Number,
    proof: Number,
    
    // Tasting Notes
    tastingNotes: {
      nose: [String],
      palate: [String],
      finish: [String],
      color: String
    },
    
    // Food Pairing
    foodPairing: [String],
    servingTemperature: String,
    
    // Certifications
    organic: Boolean,
    vegan: Boolean,
    kosher: Boolean,
    biodynamic: Boolean,
    sustainable: Boolean
  },

  // Ratings & Reviews
  ratings: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    },
    distribution: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 }
    }
  },
  reviews: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  }],

  // Expert Ratings
  expertRatings: [{
    source: String, // e.g., "Wine Spectator", "Robert Parker"
    rating: Number,
    maxRating: Number,
    review: String,
    date: Date
  }],

  // Awards
  awards: [{
    name: String,
    year: Number,
    organization: String,
    medal: String // gold, silver, bronze
  }],

  // Tags & Classification
  tags: [String],
  collections: [String], // e.g., "Summer Collection", "Staff Picks"
  occasion: [String], // e.g., "Wedding", "Anniversary", "Gift"
  
  // Product Status
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isNewArrival: {
    type: Boolean,
    default: false
  },
  isBestseller: {
    type: Boolean,
    default: false
  },
  isOnSale: {
    type: Boolean,
    default: false
  },
  isLimitedEdition: {
    type: Boolean,
    default: false
  },
  isExclusive: {
    type: Boolean,
    default: false
  },

  // Availability
  availableForPickup: {
    type: Boolean,
    default: true
  },
  availableForDelivery: {
    type: Boolean,
    default: true
  },
  availableInStore: {
    type: Boolean,
    default: true
  },
  
  // Age restrictions
  ageRestricted: {
    type: Boolean,
    default: true
  },
  minimumAge: {
    type: Number,
    default: 21
  },

  // Shipping
  weight: Number, // in pounds
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  shippingClass: String,
  shippableStates: [String],
  requiresSignature: {
    type: Boolean,
    default: true
  },

  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  salesCount: {
    type: Number,
    default: 0
  },
  wishlistCount: {
    type: Number,
    default: 0
  },
  cartAddCount: {
    type: Number,
    default: 0
  },
  conversionRate: Number,

  // Related Products
  relatedProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  frequentlyBoughtTogether: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  upsells: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  crossSells: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],

  // SEO
  seo: {
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    ogImage: String,
    canonicalUrl: String
  },

  // Vendor Information
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  supplier: {
    name: String,
    contact: String,
    email: String,
    phone: String
  },

  // Dates
  launchDate: Date,
  discontinuedDate: Date,
  saleStartDate: Date,
  saleEndDate: Date,

  // Additional Info
  returnPolicy: String,
  warrantyInfo: String,
  disclaimer: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
productSchema.index({ name: 'text', description: 'text', brand: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ 'ratings.average': -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ slug: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ 'specifications.type': 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ isOnSale: 1, isActive: 1 });

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function() {
  if (this.compareAtPrice && this.compareAtPrice > this.price) {
    return Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100);
  }
  return 0;
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (!this.trackInventory) return 'in_stock';
  if (this.stock === 0) return 'out_of_stock';
  if (this.stock <= this.lowStockThreshold) return 'low_stock';
  return 'in_stock';
});

// Virtual for availability status
productSchema.virtual('availabilityStatus').get(function() {
  if (!this.isActive) return 'inactive';
  if (this.discontinuedDate && this.discontinuedDate < Date.now()) return 'discontinued';
  if (this.stock === 0) return 'out_of_stock';
  return 'available';
});

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function() {
  if (!this.costPrice) return null;
  return ((this.price - this.costPrice) / this.price * 100).toFixed(2);
});

// Generate slug before saving
productSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

// Update rating distribution
productSchema.methods.updateRating = async function() {
  const Review = mongoose.model('Review');
  
  const stats = await Review.aggregate([
    { $match: { product: this._id, isApproved: true } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        numRatings: { $sum: 1 }
      }
    }
  ]);

  const distribution = await Review.aggregate([
    { $match: { product: this._id, isApproved: true } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    this.ratings.average = Math.round(stats[0].avgRating * 10) / 10;
    this.ratings.count = stats[0].numRatings;
  } else {
    this.ratings.average = 0;
    this.ratings.count = 0;
  }

  // Update distribution
  this.ratings.distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  distribution.forEach(item => {
    this.ratings.distribution[item._id] = item.count;
  });

  await this.save();
};

// Check if product is on sale
productSchema.methods.isCurrentlyOnSale = function() {
  if (!this.isOnSale) return false;
  
  const now = Date.now();
  const saleStarted = !this.saleStartDate || this.saleStartDate <= now;
  const saleNotEnded = !this.saleEndDate || this.saleEndDate >= now;
  
  return saleStarted && saleNotEnded;
};

// Get effective price (considering sale)
productSchema.methods.getEffectivePrice = function() {
  return this.isCurrentlyOnSale() ? this.price : this.compareAtPrice || this.price;
};

// Reserve stock
productSchema.methods.reserveStock = async function(quantity, warehouseId = null) {
  if (!this.trackInventory) return true;
  
  if (warehouseId) {
    const warehouse = this.warehouseLocations.find(w => w.warehouse === warehouseId);
    if (warehouse && warehouse.quantity - warehouse.reserved >= quantity) {
      warehouse.reserved += quantity;
      await this.save();
      return true;
    }
    return false;
  } else {
    if (this.stock >= quantity) {
      this.stock -= quantity;
      await this.save();
      return true;
    }
    return false;
  }
};

// Release reserved stock
productSchema.methods.releaseStock = async function(quantity, warehouseId = null) {
  if (!this.trackInventory) return true;
  
  if (warehouseId) {
    const warehouse = this.warehouseLocations.find(w => w.warehouse === warehouseId);
    if (warehouse) {
      warehouse.reserved = Math.max(0, warehouse.reserved - quantity);
      await this.save();
      return true;
    }
    return false;
  } else {
    this.stock += quantity;
    await this.save();
    return true;
  }
};

module.exports = mongoose.model('Product', productSchema);