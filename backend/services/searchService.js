const Product = require('../models/Product');
const { Category } = require('../models/index');

class SearchService {
  /**
   * Advanced product search with filters, sorting, and facets
   */
  static async searchProducts(params) {
    const {
      query = '',
      category,
      brand,
      minPrice,
      maxPrice,
      rating,
      inStock = false,
      featured = false,
      onSale = false,
      type,
      alcoholContent,
      vintage,
      region,
      country,
      sort = '-createdAt',
      page = 1,
      limit = 24,
      facets = true
    } = params;

    // Build base query
    const searchQuery = { isActive: true };

    // Text search
    if (query) {
      searchQuery.$text = { $search: query };
    }

    // Category filter
    if (category) {
      searchQuery.category = category;
    }

    // Brand filter
    if (brand) {
      if (Array.isArray(brand)) {
        searchQuery.brand = { $in: brand };
      } else {
        searchQuery.brand = brand;
      }
    }

    // Price range
    if (minPrice || maxPrice) {
      searchQuery.price = {};
      if (minPrice) searchQuery.price.$gte = Number(minPrice);
      if (maxPrice) searchQuery.price.$lte = Number(maxPrice);
    }

    // Rating filter
    if (rating) {
      searchQuery['ratings.average'] = { $gte: Number(rating) };
    }

    // Stock filter
    if (inStock === 'true' || inStock === true) {
      searchQuery.stock = { $gt: 0 };
    }

    // Featured filter
    if (featured === 'true' || featured === true) {
      searchQuery.isFeatured = true;
    }

    // On sale filter
    if (onSale === 'true' || onSale === true) {
      searchQuery.isOnSale = true;
    }

    // Specifications filters
    if (type) {
      searchQuery['specifications.type'] = type;
    }
    if (alcoholContent) {
      searchQuery['specifications.alcoholContent'] = { 
        $gte: Number(alcoholContent.min) || 0,
        $lte: Number(alcoholContent.max) || 100
      };
    }
    if (vintage) {
      searchQuery['specifications.vintage'] = Number(vintage);
    }
    if (region) {
      searchQuery['specifications.region'] = region;
    }
    if (country) {
      searchQuery['specifications.country'] = country;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    const products = await Product.find(searchQuery)
      .populate('category', 'name slug')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .select('-__v');

    const total = await Product.countDocuments(searchQuery);

    // Get facets for filtering
    let facetsData = null;
    if (facets) {
      facetsData = await this.getFacets(searchQuery);
    }

    return {
      products,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
        limit: Number(limit)
      },
      facets: facetsData
    };
  }

  /**
   * Get facets for filtering
   */
  static async getFacets(baseQuery) {
    const [
      brands,
      categories,
      priceRanges,
      types,
      countries
    ] = await Promise.all([
      // Brands with count
      Product.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),

      // Categories with count
      Product.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category'
          }
        },
        { $unwind: '$category' },
        { $project: { name: '$category.name', count: 1 } }
      ]),

      // Price ranges
      Product.aggregate([
        { $match: baseQuery },
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 25, 50, 75, 100, 150, 200, 500, 1000],
            default: 'Other',
            output: { count: { $sum: 1 } }
          }
        }
      ]),

      // Spirit types
      Product.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$specifications.type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Countries
      Product.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$specifications.country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    return {
      brands: brands.map(b => ({ name: b._id, count: b.count })),
      categories: categories.map(c => ({ name: c.name, count: c.count })),
      priceRanges,
      types: types.map(t => ({ name: t._id, count: t.count })),
      countries: countries.map(c => ({ name: c._id, count: c.count }))
    };
  }

  /**
   * Get autocomplete suggestions
   */
  static async autocomplete(query, limit = 10) {
    if (!query || query.length < 2) return [];

    const regex = new RegExp(query, 'i');

    const [products, brands, categories] = await Promise.all([
      Product.find({
        $or: [
          { name: regex },
          { brand: regex },
          { tags: regex }
        ],
        isActive: true
      })
        .select('name slug brand images price')
        .limit(limit),

      Product.distinct('brand', { brand: regex, isActive: true }).limit(5),

      Category.find({ name: regex, isActive: true })
        .select('name slug')
        .limit(5)
    ]);

    return {
      products: products.map(p => ({
        type: 'product',
        name: p.name,
        slug: p.slug,
        brand: p.brand,
        image: p.images[0]?.url,
        price: p.price
      })),
      brands: brands.map(b => ({
        type: 'brand',
        name: b
      })),
      categories: categories.map(c => ({
        type: 'category',
        name: c.name,
        slug: c.slug
      }))
    };
  }

  /**
   * Get similar products
   */
  static async getSimilarProducts(productId, limit = 6) {
    const product = await Product.findById(productId);
    if (!product) return [];

    const similarProducts = await Product.find({
      _id: { $ne: productId },
      isActive: true,
      $or: [
        { category: product.category },
        { brand: product.brand },
        { 'specifications.type': product.specifications.type },
        { tags: { $in: product.tags } }
      ]
    })
      .select('name slug brand images price ratings')
      .limit(limit)
      .sort('-ratings.average');

    return similarProducts;
  }

  /**
   * Get trending products
   */
  static async getTrendingProducts(limit = 12, days = 7) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const trendingProducts = await Product.find({
      isActive: true,
      createdAt: { $gte: dateFrom }
    })
      .sort('-viewCount -salesCount')
      .limit(limit)
      .select('name slug brand images price ratings salesCount');

    return trendingProducts;
  }

  /**
   * Get personalized recommendations
   */
  static async getRecommendations(userId, limit = 10) {
    const User = require('../models/User');
    const Order = require('../models/Order');

    const user = await User.findById(userId).populate('wishlist');
    if (!user) return [];

    // Get user's order history
    const orders = await Order.find({ user: userId, orderStatus: 'delivered' })
      .populate('items.product')
      .limit(10);

    // Extract categories and brands from past orders
    const categories = new Set();
    const brands = new Set();
    const productTypes = new Set();

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.product) {
          categories.add(item.product.category?.toString());
          brands.add(item.product.brand);
          productTypes.add(item.product.specifications?.type);
        }
      });
    });

    // Get user's favorite categories from preferences
    if (user.preferences?.favoriteCategories) {
      user.preferences.favoriteCategories.forEach(cat => categories.add(cat));
    }

    // Build recommendation query
    const recommendations = await Product.find({
      isActive: true,
      _id: { $nin: user.wishlist }, // Exclude wishlist items
      $or: [
        { category: { $in: Array.from(categories) } },
        { brand: { $in: Array.from(brands) } },
        { 'specifications.type': { $in: Array.from(productTypes) } }
      ]
    })
      .sort('-ratings.average -salesCount')
      .limit(limit)
      .select('name slug brand images price ratings');

    return recommendations;
  }
}

module.exports = SearchService;