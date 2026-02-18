const Product = require('../models/Product');
const Order = require('../models/Order');
const { Review } = require('../models/index');

class RecommendationEngine {
  /**
   * Collaborative Filtering - Users who bought this also bought
   */
  static async frequentlyBoughtTogether(productId, limit = 4) {
    const orders = await Order.find({
      'items.product': productId,
      orderStatus: 'delivered'
    }).select('items');

    // Count co-occurring products
    const productCounts = {};
    
    orders.forEach(order => {
      const otherProducts = order.items
        .filter(item => item.product.toString() !== productId.toString())
        .map(item => item.product.toString());

      otherProducts.forEach(pid => {
        productCounts[pid] = (productCounts[pid] || 0) + 1;
      });
    });

    // Get top co-occurring products
    const topProductIds = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(entry => entry[0]);

    const products = await Product.find({
      _id: { $in: topProductIds },
      isActive: true
    }).select('name slug brand images price ratings');

    return products;
  }

  /**
   * Content-Based Filtering - Similar products
   */
  static async contentBasedRecommendations(productId, limit = 6) {
    const product = await Product.findById(productId);
    if (!product) return [];

    // Calculate similarity score
    const similarProducts = await Product.find({
      _id: { $ne: productId },
      isActive: true
    }).select('name slug brand category specifications tags images price ratings');

    const scoredProducts = similarProducts.map(p => {
      let score = 0;

      // Same category
      if (p.category.toString() === product.category.toString()) score += 5;

      // Same brand
      if (p.brand === product.brand) score += 3;

      // Same type
      if (p.specifications?.type === product.specifications?.type) score += 4;

      // Similar price range (within 20%)
      const priceDiff = Math.abs(p.price - product.price) / product.price;
      if (priceDiff <= 0.2) score += 2;

      // Shared tags
      const sharedTags = p.tags.filter(tag => product.tags.includes(tag));
      score += sharedTags.length;

      // Similar alcohol content
      if (p.specifications?.alcoholContent && product.specifications?.alcoholContent) {
        const alcoholDiff = Math.abs(
          p.specifications.alcoholContent - product.specifications.alcoholContent
        );
        if (alcoholDiff <= 5) score += 1;
      }

      return { product: p, score };
    });

    // Sort by score and return top matches
    return scoredProducts
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.product);
  }

  /**
   * Trending products based on recent activity
   */
  static async getTrendingProducts(limit = 12, timeframe = 7) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - timeframe);

    // Get products with high recent activity
    const trending = await Product.find({
      isActive: true,
      updatedAt: { $gte: dateFrom }
    })
      .sort('-viewCount -cartAddCount -salesCount')
      .limit(limit)
      .select('name slug brand images price ratings viewCount salesCount');

    return trending;
  }

  /**
   * Personalized recommendations for user
   */
  static async personalizedForUser(userId, limit = 10) {
    const User = require('../models/User');
    
    const user = await User.findById(userId);
    if (!user) return [];

    // Get user's purchase history
    const orders = await Order.find({
      user: userId,
      orderStatus: 'delivered'
    })
      .populate('items.product')
      .sort('-createdAt')
      .limit(20);

    // Extract user preferences
    const purchasedProducts = [];
    const categories = {};
    const brands = {};
    const types = {};
    const priceRange = { min: Infinity, max: 0 };

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.product) {
          purchasedProducts.push(item.product._id.toString());
          
          // Track categories
          const catId = item.product.category?.toString();
          if (catId) categories[catId] = (categories[catId] || 0) + 1;
          
          // Track brands
          if (item.product.brand) {
            brands[item.product.brand] = (brands[item.product.brand] || 0) + 1;
          }
          
          // Track types
          const type = item.product.specifications?.type;
          if (type) types[type] = (types[type] || 0) + 1;
          
          // Track price range
          if (item.product.price < priceRange.min) priceRange.min = item.product.price;
          if (item.product.price > priceRange.max) priceRange.max = item.product.price;
        }
      });
    });

    // Get top preferences
    const topCategories = Object.keys(categories)
      .sort((a, b) => categories[b] - categories[a])
      .slice(0, 3);
    
    const topBrands = Object.keys(brands)
      .sort((a, b) => brands[b] - brands[a])
      .slice(0, 3);
    
    const topTypes = Object.keys(types)
      .sort((a, b) => types[b] - types[a])
      .slice(0, 2);

    // Build recommendation query
    const query = {
      isActive: true,
      _id: { $nin: purchasedProducts } // Exclude already purchased
    };

    // Add preference filters
    const orConditions = [];
    
    if (topCategories.length > 0) {
      orConditions.push({ category: { $in: topCategories } });
    }
    if (topBrands.length > 0) {
      orConditions.push({ brand: { $in: topBrands } });
    }
    if (topTypes.length > 0) {
      orConditions.push({ 'specifications.type': { $in: topTypes } });
    }

    if (orConditions.length > 0) {
      query.$or = orConditions;
    }

    // Add price range (with some flexibility)
    if (priceRange.min !== Infinity) {
      query.price = {
        $gte: priceRange.min * 0.7,
        $lte: priceRange.max * 1.3
      };
    }

    // Get recommendations
    const recommendations = await Product.find(query)
      .sort('-ratings.average -salesCount')
      .limit(limit)
      .select('name slug brand images price ratings');

    return recommendations;
  }

  /**
   * New arrivals in user's favorite categories
   */
  static async newArrivalsForUser(userId, limit = 8) {
    const User = require('../models/User');
    
    const user = await User.findById(userId);
    if (!user) return [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const query = {
      isActive: true,
      isNewArrival: true,
      createdAt: { $gte: thirtyDaysAgo }
    };

    // Add user's favorite categories if available
    if (user.preferences?.favoriteCategories?.length > 0) {
      query.category = { $in: user.preferences.favoriteCategories };
    }

    const newProducts = await Product.find(query)
      .sort('-createdAt')
      .limit(limit)
      .select('name slug brand images price ratings');

    return newProducts;
  }

  /**
   * Upsell recommendations (higher-priced alternatives)
   */
  static async upsellRecommendations(productId, limit = 4) {
    const product = await Product.findById(productId);
    if (!product) return [];

    const upsells = await Product.find({
      _id: { $ne: productId },
      isActive: true,
      category: product.category,
      price: { $gt: product.price, $lte: product.price * 1.5 },
      'ratings.average': { $gte: product.ratings.average }
    })
      .sort('-ratings.average price')
      .limit(limit)
      .select('name slug brand images price ratings');

    return upsells;
  }

  /**
   * Cross-sell recommendations (complementary products)
   */
  static async crossSellRecommendations(productId, limit = 4) {
    const product = await Product.findById(productId);
    if (!product) return [];

    // Define complementary product types
    const complementaryTypes = {
      'whiskey': ['cigar', 'glassware', 'wine', 'cognac'],
      'wine': ['cheese', 'glassware', 'whiskey', 'champagne'],
      'vodka': ['mixer', 'glassware', 'gin', 'tequila'],
      'rum': ['mixer', 'cigar', 'tequila'],
      'gin': ['tonic', 'glassware', 'vodka'],
      'tequila': ['mixer', 'mezcal', 'rum']
    };

    const productType = product.specifications?.type;
    const complementary = complementaryTypes[productType] || [];

    const crossSells = await Product.find({
      _id: { $ne: productId },
      isActive: true,
      $or: [
        { 'specifications.type': { $in: complementary } },
        { tags: { $in: product.tags } },
        { category: product.category }
      ]
    })
      .sort('-ratings.average -salesCount')
      .limit(limit)
      .select('name slug brand images price ratings');

    return crossSells;
  }

  /**
   * Bundle recommendations
   */
  static async bundleRecommendations(productId, limit = 3) {
    const product = await Product.findById(productId);
    if (!product) return [];

    // Find products that are frequently bought together
    const frequentlyBought = await this.frequentlyBoughtTogether(productId, limit);
    
    if (frequentlyBought.length === 0) {
      // Fallback to similar products
      return await this.contentBasedRecommendations(productId, limit);
    }

    // Calculate bundle discount
    const totalPrice = product.price + frequentlyBought.reduce((sum, p) => sum + p.price, 0);
    const bundlePrice = totalPrice * 0.9; // 10% bundle discount

    return {
      mainProduct: product,
      bundleProducts: frequentlyBought,
      totalPrice,
      bundlePrice,
      savings: totalPrice - bundlePrice
    };
  }
}

module.exports = RecommendationEngine;