class CustomerSegmentationService {
  constructor() {
    this.segments = new Map();
    this.customerProfiles = new Map();
  }

  /**
   * RFM Analysis (Recency, Frequency, Monetary)
   * Industry standard for customer segmentation
   */
  async performRFMAnalysis(userId) {
    const Order = require('../models/Order');
    const User = require('../models/User');

    const user = await User.findById(userId);
    const orders = await Order.find({ 
      user: userId, 
      orderStatus: 'delivered' 
    }).sort('-createdAt');

    if (orders.length === 0) {
      return {
        segment: 'new_customer',
        rfm: { r: 0, f: 0, m: 0 },
        score: 0,
        label: 'New Customer'
      };
    }

    // Calculate Recency (days since last order)
    const lastOrder = orders[0];
    const daysSinceLastOrder = Math.floor(
      (Date.now() - new Date(lastOrder.createdAt)) / (1000 * 60 * 60 * 24)
    );

    // Calculate Frequency (number of orders)
    const frequency = orders.length;

    // Calculate Monetary (total spend)
    const monetary = orders.reduce((sum, order) => sum + order.total, 0);

    // Score each dimension (1-5 scale)
    const rScore = this.scoreRecency(daysSinceLastOrder);
    const fScore = this.scoreFrequency(frequency);
    const mScore = this.scoreMonetary(monetary);

    // Combined RFM score
    const rfmScore = parseInt(`${rScore}${fScore}${mScore}`);
    const segment = this.determineSegment(rScore, fScore, mScore);

    const analysis = {
      userId,
      rfm: {
        recency: daysSinceLastOrder,
        frequency,
        monetary: monetary.toFixed(2),
        rScore,
        fScore,
        mScore
      },
      rfmScore,
      segment: segment.name,
      segmentDescription: segment.description,
      value: segment.value,
      recommendations: segment.recommendations,
      churnRisk: this.calculateChurnRisk(rScore, fScore),
      lifetimeValue: monetary,
      avgOrderValue: (monetary / frequency).toFixed(2),
      analyzedAt: new Date()
    };

    // Store customer profile
    this.customerProfiles.set(userId, analysis);

    return analysis;
  }

  /**
   * Score recency (1-5, higher is better)
   */
  scoreRecency(days) {
    if (days <= 30) return 5;
    if (days <= 60) return 4;
    if (days <= 90) return 3;
    if (days <= 180) return 2;
    return 1;
  }

  /**
   * Score frequency (1-5, higher is better)
   */
  scoreFrequency(orders) {
    if (orders >= 20) return 5;
    if (orders >= 10) return 4;
    if (orders >= 5) return 3;
    if (orders >= 2) return 2;
    return 1;
  }

  /**
   * Score monetary (1-5, higher is better)
   */
  scoreMonetary(total) {
    if (total >= 5000) return 5;
    if (total >= 2000) return 4;
    if (total >= 1000) return 3;
    if (total >= 500) return 2;
    return 1;
  }

  /**
   * Determine customer segment based on RFM scores
   */
  determineSegment(r, f, m) {
    const segments = {
      champions: {
        name: 'Champions',
        description: 'Best customers - Buy recently, often, and spend the most',
        value: 'very_high',
        condition: r >= 4 && f >= 4 && m >= 4,
        recommendations: [
          'Reward with exclusive offers',
          'Early access to new products',
          'VIP treatment',
          'Request referrals and reviews'
        ]
      },
      loyal_customers: {
        name: 'Loyal Customers',
        description: 'Buy regularly with good spending',
        value: 'high',
        condition: r >= 3 && f >= 4 && m >= 3,
        recommendations: [
          'Upsell higher value products',
          'Loyalty program benefits',
          'Exclusive member offers'
        ]
      },
      potential_loyalist: {
        name: 'Potential Loyalist',
        description: 'Recent customers with good frequency',
        value: 'medium_high',
        condition: r >= 4 && f >= 2 && m >= 2,
        recommendations: [
          'Membership or loyalty program',
          'Recommend related products',
          'Nurture with targeted content'
        ]
      },
      recent_customers: {
        name: 'Recent Customers',
        description: 'Bought recently but not frequently',
        value: 'medium',
        condition: r >= 4 && f <= 2,
        recommendations: [
          'Build relationship with onboarding',
          'Product recommendations',
          'Special first-time offers'
        ]
      },
      promising: {
        name: 'Promising',
        description: 'Recent shoppers with potential',
        value: 'medium',
        condition: r >= 3 && f >= 2 && m >= 2,
        recommendations: [
          'Create brand awareness',
          'Free shipping offers',
          'Engagement campaigns'
        ]
      },
      need_attention: {
        name: 'Need Attention',
        description: 'Above average recency, frequency & monetary',
        value: 'medium',
        condition: r >= 3 && f >= 3 && m >= 3,
        recommendations: [
          'Limited time offers',
          'Based on past purchases',
          'Reactivation campaigns'
        ]
      },
      about_to_sleep: {
        name: 'About to Sleep',
        description: 'Below average recency, frequency & monetary',
        value: 'low_medium',
        condition: r <= 2 && f >= 2 && m >= 2,
        recommendations: [
          'Win-back campaigns',
          'Special discounts',
          'Survey for feedback'
        ]
      },
      at_risk: {
        name: 'At Risk',
        description: 'Spent big money, purchased often but long ago',
        value: 'low',
        condition: r <= 2 && f >= 3 && m >= 3,
        recommendations: [
          'Aggressive win-back offers',
          'Personalized reconnection',
          'Product updates'
        ]
      },
      cant_lose_them: {
        name: "Can't Lose Them",
        description: 'Were best customers but haven\'t returned',
        value: 'low',
        condition: r <= 1 && f >= 4 && m >= 4,
        recommendations: [
          'Win back at all costs',
          'VIP win-back offers',
          'Personal outreach',
          'Understand why they left'
        ]
      },
      hibernating: {
        name: 'Hibernating',
        description: 'Last purchase long ago, low frequency',
        value: 'very_low',
        condition: r <= 2 && f <= 2 && m >= 2,
        recommendations: [
          'Highly targeted win-back',
          'Survey and feedback',
          'Consider removing from active lists'
        ]
      },
      lost: {
        name: 'Lost',
        description: 'Haven\'t purchased in very long time',
        value: 'very_low',
        condition: r <= 1 && f <= 2 && m <= 2,
        recommendations: [
          'Last chance win-back',
          'Deep discounts',
          'Consider churned'
        ]
      }
    };

    // Find matching segment
    for (const segment of Object.values(segments)) {
      if (segment.condition) {
        return segment;
      }
    }

    // Default segment
    return {
      name: 'New Customer',
      description: 'First time or very early customer',
      value: 'medium',
      recommendations: ['Welcome campaign', 'First purchase incentive']
    };
  }

  /**
   * Calculate churn risk (0-100)
   */
  calculateChurnRisk(rScore, fScore) {
    const baseRisk = 50;
    const recencyImpact = (5 - rScore) * 15;
    const frequencyImpact = (5 - fScore) * 10;
    
    const risk = baseRisk + recencyImpact + frequencyImpact;
    return Math.min(Math.max(risk, 0), 100);
  }

  /**
   * Behavioral Segmentation
   */
  async behavioralSegmentation(userId) {
    const Order = require('../models/Order');
    const Review = require('../models').Review;
    const Wishlist = require('../models/Wishlist');

    const [orders, reviews, wishlist] = await Promise.all([
      Order.find({ user: userId, orderStatus: 'delivered' }),
      Review.find({ user: userId }),
      Wishlist.findOne({ user: userId })
    ]);

    const behaviors = {
      purchaseBehavior: this.analyzePurchaseBehavior(orders),
      engagementBehavior: this.analyzeEngagement(reviews, wishlist),
      categoryPreferences: this.analyzeCategoryPreferences(orders),
      priceSegment: this.analyzePriceSegment(orders),
      shoppingPatterns: this.analyzeShoppingPatterns(orders)
    };

    return behaviors;
  }

  /**
   * Analyze purchase behavior
   */
  analyzePurchaseBehavior(orders) {
    if (orders.length === 0) return { type: 'non_buyer' };

    const avgOrderValue = orders.reduce((sum, o) => sum + o.total, 0) / orders.length;
    const avgItemsPerOrder = orders.reduce((sum, o) => sum + o.items.length, 0) / orders.length;

    let type;
    if (avgOrderValue > 500 && avgItemsPerOrder > 5) {
      type = 'bulk_buyer';
    } else if (avgOrderValue > 300) {
      type = 'premium_buyer';
    } else if (orders.length > 10) {
      type = 'frequent_buyer';
    } else if (avgItemsPerOrder > 5) {
      type = 'variety_seeker';
    } else {
      type = 'occasional_buyer';
    }

    return {
      type,
      avgOrderValue: avgOrderValue.toFixed(2),
      avgItemsPerOrder: avgItemsPerOrder.toFixed(1),
      totalOrders: orders.length
    };
  }

  /**
   * Analyze engagement
   */
  analyzeEngagement(reviews, wishlist) {
    const reviewCount = reviews?.length || 0;
    const wishlistCount = wishlist?.items?.length || 0;

    let level;
    if (reviewCount >= 5 || wishlistCount >= 10) {
      level = 'highly_engaged';
    } else if (reviewCount >= 2 || wishlistCount >= 5) {
      level = 'moderately_engaged';
    } else if (reviewCount >= 1 || wishlistCount >= 1) {
      level = 'lightly_engaged';
    } else {
      level = 'passive';
    }

    return {
      level,
      reviewCount,
      wishlistCount,
      engagementScore: (reviewCount * 10) + (wishlistCount * 2)
    };
  }

  /**
   * Analyze category preferences
   */
  analyzeCategoryPreferences(orders) {
    const categoryCount = new Map();
    const brandCount = new Map();

    orders.forEach(order => {
      order.items.forEach(item => {
        // Category analysis
        const category = item.category || 'uncategorized';
        categoryCount.set(category, (categoryCount.get(category) || 0) + 1);

        // Brand analysis
        const brand = item.brand || 'unknown';
        brandCount.set(brand, (brandCount.get(brand) || 0) + 1);
      });
    });

    const topCategories = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));

    const topBrands = Array.from(brandCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([brand, count]) => ({ brand, count }));

    return {
      topCategories,
      topBrands,
      diversityScore: categoryCount.size // More categories = more diverse
    };
  }

  /**
   * Analyze price segment
   */
  analyzePriceSegment(orders) {
    if (orders.length === 0) return { segment: 'unknown' };

    const avgOrderValue = orders.reduce((sum, o) => sum + o.total, 0) / orders.length;

    let segment;
    if (avgOrderValue >= 500) segment = 'premium';
    else if (avgOrderValue >= 200) segment = 'mid_market';
    else if (avgOrderValue >= 100) segment = 'value';
    else segment = 'budget';

    return {
      segment,
      avgOrderValue: avgOrderValue.toFixed(2),
      priceRange: this.getPriceRange(segment)
    };
  }

  /**
   * Analyze shopping patterns
   */
  analyzeShoppingPatterns(orders) {
    if (orders.length === 0) return { pattern: 'no_pattern' };

    // Time-based patterns
    const hourDistribution = new Array(24).fill(0);
    const dayDistribution = new Array(7).fill(0);
    const monthDistribution = new Array(12).fill(0);

    orders.forEach(order => {
      const date = new Date(order.createdAt);
      hourDistribution[date.getHours()]++;
      dayDistribution[date.getDay()]++;
      monthDistribution[date.getMonth()]++;
    });

    const preferredHour = hourDistribution.indexOf(Math.max(...hourDistribution));
    const preferredDay = dayDistribution.indexOf(Math.max(...dayDistribution));
    const preferredMonth = monthDistribution.indexOf(Math.max(...monthDistribution));

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return {
      preferredHour: `${preferredHour}:00`,
      preferredDay: dayNames[preferredDay],
      preferredMonth: monthNames[preferredMonth],
      isWeekendShopper: [0, 6].includes(preferredDay),
      isEveningShopper: preferredHour >= 18,
      pattern: this.determineShoppingPattern(hourDistribution, dayDistribution)
    };
  }

  /**
   * Determine shopping pattern
   */
  determineShoppingPattern(hourDist, dayDist) {
    const eveningOrders = hourDist.slice(18, 24).reduce((a, b) => a + b, 0);
    const weekendOrders = dayDist[0] + dayDist[6];
    const totalOrders = hourDist.reduce((a, b) => a + b, 0);

    if (eveningOrders / totalOrders > 0.6) return 'evening_shopper';
    if (weekendOrders / totalOrders > 0.5) return 'weekend_shopper';
    return 'regular_shopper';
  }

  /**
   * Get price range for segment
   */
  getPriceRange(segment) {
    const ranges = {
      premium: '$500+',
      mid_market: '$200-$500',
      value: '$100-$200',
      budget: 'Under $100'
    };
    return ranges[segment] || 'Unknown';
  }

  /**
   * Predictive Customer Lifetime Value (CLV)
   */
  async predictCLV(userId) {
    const rfm = await this.performRFMAnalysis(userId);
    
    const avgOrderValue = parseFloat(rfm.avgOrderValue);
    const frequency = rfm.rfm.frequency;
    const recency = rfm.rfm.recency;

    // Simple CLV prediction formula
    // CLV = (Average Order Value) × (Purchase Frequency) × (Customer Lifespan)
    
    // Estimate lifespan based on recency
    let estimatedLifespan = 12; // months
    if (recency <= 30) estimatedLifespan = 24;
    else if (recency <= 90) estimatedLifespan = 18;
    else if (recency <= 180) estimatedLifespan = 12;
    else estimatedLifespan = 6;

    // Estimate future purchase frequency (annual)
    const purchaseFrequency = frequency / (recency / 30); // per month
    const annualFrequency = purchaseFrequency * 12;

    const clv = avgOrderValue * annualFrequency * (estimatedLifespan / 12);

    return {
      userId,
      predictedCLV: clv.toFixed(2),
      estimatedLifespan: `${estimatedLifespan} months`,
      annualFrequency: annualFrequency.toFixed(1),
      avgOrderValue: avgOrderValue.toFixed(2),
      confidence: this.calculateCLVConfidence(frequency, recency),
      segment: this.getCLVSegment(clv)
    };
  }

  /**
   * Calculate CLV confidence
   */
  calculateCLVConfidence(frequency, recency) {
    let confidence = 50;
    if (frequency >= 10) confidence += 20;
    else if (frequency >= 5) confidence += 10;
    
    if (recency <= 30) confidence += 20;
    else if (recency <= 90) confidence += 10;

    return Math.min(confidence, 90);
  }

  /**
   * Get CLV segment
   */
  getCLVSegment(clv) {
    if (clv >= 5000) return 'platinum';
    if (clv >= 2000) return 'gold';
    if (clv >= 1000) return 'silver';
    return 'bronze';
  }

  /**
   * Get personalized product recommendations
   */
  async getPersonalizedRecommendations(userId, limit = 10) {
    const behavioral = await this.behavioralSegmentation(userId);
    const Product = require('../models/Product');

    // Get top categories
    const topCategories = behavioral.categoryPreferences.topCategories.map(c => c.category);
    
    // Get products from preferred categories
    const recommendations = await Product.find({
      category: { $in: topCategories },
      isActive: true,
      stock: { $gt: 0 }
    })
    .sort('-rating -salesCount')
    .limit(limit)
    .select('name price rating images category');

    return recommendations;
  }

  /**
   * Cohort Analysis
   */
  async cohortAnalysis(startDate, endDate) {
    const User = require('../models/User');
    const Order = require('../models/Order');

    const users = await User.find({
      createdAt: { $gte: startDate, $lte: endDate },
      role: 'user'
    });

    const cohorts = new Map();

    for (const user of users) {
      const cohortMonth = new Date(user.createdAt).toISOString().substring(0, 7);
      
      if (!cohorts.has(cohortMonth)) {
        cohorts.set(cohortMonth, {
          month: cohortMonth,
          users: 0,
          revenue: 0,
          orders: 0,
          retention: {}
        });
      }

      const cohort = cohorts.get(cohortMonth);
      cohort.users++;

      // Get user's orders
      const userOrders = await Order.find({ 
        user: user._id,
        orderStatus: 'delivered'
      });

      cohort.orders += userOrders.length;
      cohort.revenue += userOrders.reduce((sum, o) => sum + o.total, 0);
    }

    return Array.from(cohorts.values());
  }

  /**
   * Batch segment all customers
   */
  async segmentAllCustomers() {
    const User = require('../models/User');
    const users = await User.find({ role: 'user' }).select('_id');

    const segments = {
      champions: [],
      loyal_customers: [],
      potential_loyalist: [],
      at_risk: [],
      lost: [],
      other: []
    };

    for (const user of users) {
      try {
        const analysis = await this.performRFMAnalysis(user._id);
        const segmentKey = analysis.segment.toLowerCase().replace(/[^a-z_]/g, '_');
        
        if (segments[segmentKey]) {
          segments[segmentKey].push(user._id);
        } else {
          segments.other.push(user._id);
        }
      } catch (error) {
        console.error(`Error segmenting user ${user._id}:`, error.message);
      }
    }

    return {
      total: users.length,
      segments: Object.fromEntries(
        Object.entries(segments).map(([key, value]) => [key, value.length])
      ),
      segmentDetails: segments
    };
  }
}

module.exports = new CustomerSegmentationService();