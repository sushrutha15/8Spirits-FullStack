class PriceOptimizationService {
  constructor() {
    this.priceHistory = new Map();
    this.demandCurves = new Map();
    this.competitorPrices = new Map();
    this.seasonalFactors = new Map();
  }

  /**
   * Dynamic pricing based on demand, competition, inventory
   */
  async optimizePrice(productId, currentPrice, context = {}) {
    const factors = await this.collectPricingFactors(productId, context);
    const baseScore = 1.0;

    // Calculate multipliers
    const demandMultiplier = this.calculateDemandMultiplier(factors.demand);
    const inventoryMultiplier = this.calculateInventoryMultiplier(factors.inventory);
    const competitionMultiplier = this.calculateCompetitionMultiplier(factors.competition);
    const seasonalMultiplier = this.calculateSeasonalMultiplier(factors.seasonal);
    const timeMultiplier = this.calculateTimeMultiplier(factors.time);

    // Combined multiplier
    const totalMultiplier = baseScore *
      demandMultiplier *
      inventoryMultiplier *
      competitionMultiplier *
      seasonalMultiplier *
      timeMultiplier;

    // Calculate optimized price
    let optimizedPrice = currentPrice * totalMultiplier;

    // Apply constraints
    optimizedPrice = this.applyPriceConstraints(optimizedPrice, currentPrice, context);

    // Round to .99 pricing psychology
    optimizedPrice = this.applyPsychologicalPricing(optimizedPrice);

    const recommendation = {
      productId,
      currentPrice,
      optimizedPrice,
      change: optimizedPrice - currentPrice,
      changePercent: ((optimizedPrice - currentPrice) / currentPrice * 100).toFixed(2),
      factors: {
        demand: { score: factors.demand, multiplier: demandMultiplier },
        inventory: { score: factors.inventory, multiplier: inventoryMultiplier },
        competition: { score: factors.competition, multiplier: competitionMultiplier },
        seasonal: { score: factors.seasonal, multiplier: seasonalMultiplier },
        time: { score: factors.time, multiplier: timeMultiplier }
      },
      confidence: this.calculateConfidence(factors),
      recommendation: this.generateRecommendation(optimizedPrice, currentPrice),
      timestamp: new Date()
    };

    // Store in history
    this.recordPriceChange(productId, recommendation);

    return recommendation;
  }

  /**
   * Collect all pricing factors
   */
  async collectPricingFactors(productId, context) {
    const Product = require('../models/Product');
    const Order = require('../models/Order');

    const product = await Product.findById(productId);

    // Demand factor (based on recent sales velocity)
    const recentOrders = await Order.countDocuments({
      'items.product': productId,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    const demand = recentOrders / 7; // Daily average

    // Inventory factor
    const inventory = {
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      ratio: product.stock / (product.lowStockThreshold || 1)
    };

    // Competition factor (mock data - integrate with price scraping API)
    const competition = {
      avgCompetitorPrice: currentPrice * (0.95 + Math.random() * 0.1),
      lowestCompetitorPrice: currentPrice * 0.9,
      highestCompetitorPrice: currentPrice * 1.1,
      numberOfCompetitors: 5
    };

    // Seasonal factor
    const seasonal = this.getSeasonalFactor(product.category);

    // Time factor (day of week, time of day)
    const time = {
      dayOfWeek: new Date().getDay(),
      hour: new Date().getHours(),
      isWeekend: [0, 6].includes(new Date().getDay()),
      isHoliday: this.isHoliday()
    };

    return { demand, inventory, competition, seasonal, time };
  }

  /**
   * Calculate demand-based multiplier
   */
  calculateDemandMultiplier(demand) {
    // High demand = higher prices
    if (demand > 20) return 1.15; // +15%
    if (demand > 10) return 1.10; // +10%
    if (demand > 5) return 1.05;  // +5%
    if (demand < 1) return 0.95;  // -5%
    return 1.0;
  }

  /**
   * Calculate inventory-based multiplier
   */
  calculateInventoryMultiplier(inventory) {
    const ratio = inventory.ratio;

    // Low stock = higher prices (scarcity)
    if (ratio < 0.3) return 1.12; // +12%
    if (ratio < 0.5) return 1.05; // +5%
    
    // High stock = lower prices (clear inventory)
    if (ratio > 3) return 0.92;   // -8%
    if (ratio > 2) return 0.95;   // -5%
    
    return 1.0;
  }

  /**
   * Calculate competition-based multiplier
   */
  calculateCompetitionMultiplier(competition) {
    const avgPrice = competition.avgCompetitorPrice;
    const currentPrice = this.currentPrice || avgPrice;

    const ratio = currentPrice / avgPrice;

    // Price higher than competitors
    if (ratio > 1.1) return 0.95; // Reduce price
    if (ratio > 1.05) return 0.98;

    // Price lower than competitors
    if (ratio < 0.9) return 1.05; // Can increase
    if (ratio < 0.95) return 1.02;

    return 1.0;
  }

  /**
   * Calculate seasonal multiplier
   */
  calculateSeasonalMultiplier(seasonal) {
    const month = new Date().getMonth();

    // Peak seasons for alcohol
    const peakSeasons = {
      11: 1.15, // December (holidays)
      0: 1.10,  // January (New Year)
      6: 1.08,  // July (summer)
      7: 1.08   // August (summer)
    };

    return peakSeasons[month] || 1.0;
  }

  /**
   * Calculate time-based multiplier
   */
  calculateTimeMultiplier(time) {
    let multiplier = 1.0;

    // Weekend premium
    if (time.isWeekend) {
      multiplier *= 1.03;
    }

    // Evening premium (5pm-10pm)
    if (time.hour >= 17 && time.hour <= 22) {
      multiplier *= 1.02;
    }

    // Holiday premium
    if (time.isHoliday) {
      multiplier *= 1.05;
    }

    return multiplier;
  }

  /**
   * Apply price constraints
   */
  applyPriceConstraints(price, currentPrice, context) {
    // Maximum change per adjustment
    const maxChange = context.maxChangePercent || 15;
    const minPrice = currentPrice * (1 - maxChange / 100);
    const maxPrice = currentPrice * (1 + maxChange / 100);

    price = Math.max(minPrice, Math.min(maxPrice, price));

    // Absolute minimum price (cost + margin)
    if (context.minPrice) {
      price = Math.max(price, context.minPrice);
    }

    // Absolute maximum price
    if (context.maxPrice) {
      price = Math.min(price, context.maxPrice);
    }

    return price;
  }

  /**
   * Apply psychological pricing (.99 strategy)
   */
  applyPsychologicalPricing(price) {
    // Round to nearest .99
    const rounded = Math.floor(price);
    return rounded + 0.99;
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(factors) {
    let confidence = 70; // Base confidence

    // More data = higher confidence
    if (factors.demand > 10) confidence += 10;
    if (factors.inventory.stock > 20) confidence += 5;
    if (factors.competition.numberOfCompetitors >= 3) confidence += 10;

    return Math.min(confidence, 95);
  }

  /**
   * Generate recommendation text
   */
  generateRecommendation(optimizedPrice, currentPrice) {
    const diff = optimizedPrice - currentPrice;
    const percent = Math.abs((diff / currentPrice) * 100).toFixed(1);

    if (Math.abs(diff) < 0.50) {
      return `Keep current price - optimal pricing achieved`;
    }

    if (diff > 0) {
      return `Increase price by $${diff.toFixed(2)} (+${percent}%) to maximize revenue`;
    } else {
      return `Decrease price by $${Math.abs(diff).toFixed(2)} (-${percent}%) to boost sales`;
    }
  }

  /**
   * Record price change in history
   */
  recordPriceChange(productId, recommendation) {
    if (!this.priceHistory.has(productId)) {
      this.priceHistory.set(productId, []);
    }

    const history = this.priceHistory.get(productId);
    history.push(recommendation);

    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Get seasonal factor for category
   */
  getSeasonalFactor(category) {
    // Mock seasonal data
    const month = new Date().getMonth();
    
    const seasonalData = {
      wine: { peak: [11, 0, 1], low: [4, 5, 6] },
      whiskey: { peak: [11, 0], low: [5, 6, 7] },
      champagne: { peak: [11, 0], low: [2, 3, 4] }
    };

    return 1.0; // Simplified
  }

  /**
   * Check if today is a holiday
   */
  isHoliday() {
    const today = new Date();
    const month = today.getMonth();
    const date = today.getDate();

    const holidays = [
      { month: 0, date: 1 },   // New Year
      { month: 6, date: 4 },   // July 4th
      { month: 11, date: 25 }  // Christmas
    ];

    return holidays.some(h => h.month === month && h.date === date);
  }

  /**
   * Predict optimal price for future date
   */
  async predictFuturePrice(productId, daysAhead = 7) {
    const history = this.priceHistory.get(productId) || [];
    
    if (history.length < 10) {
      return { error: 'Insufficient data for prediction' };
    }

    // Simple trend analysis
    const recentPrices = history.slice(-10).map(h => h.optimizedPrice);
    const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    
    const trend = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices.length;
    const predictedPrice = avgPrice + (trend * daysAhead);

    return {
      productId,
      currentAvgPrice: avgPrice,
      trend: trend > 0 ? 'increasing' : 'decreasing',
      trendRate: Math.abs(trend).toFixed(2),
      predictedPrice: predictedPrice.toFixed(2),
      daysAhead,
      confidence: 65
    };
  }

  /**
   * Batch optimize prices for multiple products
   */
  async batchOptimize(productIds, context = {}) {
    const results = [];

    for (const productId of productIds) {
      try {
        const Product = require('../models/Product');
        const product = await Product.findById(productId);
        
        if (product) {
          const optimization = await this.optimizePrice(
            productId,
            product.price,
            context
          );
          results.push(optimization);
        }
      } catch (error) {
        results.push({
          productId,
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = new PriceOptimizationService();