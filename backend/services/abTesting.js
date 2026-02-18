const crypto = require('crypto');

class ABTestingService {
  constructor() {
    this.experiments = new Map();
    this.userAssignments = new Map();
    this.results = new Map();
  }

  /**
   * Create new A/B test experiment
   */
  createExperiment(config) {
    const experiment = {
      id: config.id || this.generateExperimentId(),
      name: config.name,
      description: config.description,
      variants: config.variants, // e.g., [{id: 'control', weight: 50}, {id: 'variant_a', weight: 50}]
      status: 'active',
      startDate: config.startDate || new Date(),
      endDate: config.endDate,
      targetAudience: config.targetAudience || {}, // Targeting rules
      metrics: config.metrics || ['conversion_rate', 'revenue', 'engagement'],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.experiments.set(experiment.id, experiment);
    this.results.set(experiment.id, {
      variants: {},
      summary: {}
    });

    // Initialize results for each variant
    experiment.variants.forEach(variant => {
      this.results.get(experiment.id).variants[variant.id] = {
        impressions: 0,
        conversions: 0,
        revenue: 0,
        engagement: 0,
        users: new Set()
      };
    });

    console.log(`🧪 Created experiment: ${experiment.name} (${experiment.id})`);
    return experiment;
  }

  /**
   * Assign user to variant (consistent hashing)
   */
  assignVariant(experimentId, userId, context = {}) {
    const experiment = this.experiments.get(experimentId);
    
    if (!experiment || experiment.status !== 'active') {
      return null;
    }

    // Check if already assigned
    const assignmentKey = `${experimentId}:${userId}`;
    if (this.userAssignments.has(assignmentKey)) {
      return this.userAssignments.get(assignmentKey);
    }

    // Check targeting rules
    if (!this.matchesTargeting(experiment.targetAudience, context)) {
      return null;
    }

    // Consistent hash-based assignment
    const variant = this.selectVariant(experimentId, userId, experiment.variants);
    
    const assignment = {
      experimentId,
      userId,
      variant: variant.id,
      assignedAt: new Date(),
      context
    };

    this.userAssignments.set(assignmentKey, assignment);
    
    // Track impression
    this.trackImpression(experimentId, variant.id, userId);

    return assignment;
  }

  /**
   * Select variant using weighted random assignment
   */
  selectVariant(experimentId, userId, variants) {
    // Use deterministic hash for consistency
    const hash = crypto
      .createHash('md5')
      .update(`${experimentId}:${userId}`)
      .digest('hex');
    
    const hashNumber = parseInt(hash.substring(0, 8), 16);
    const percentage = (hashNumber % 100) + 1; // 1-100

    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (percentage <= cumulativeWeight) {
        return variant;
      }
    }

    return variants[0]; // Fallback to first variant
  }

  /**
   * Check if user matches targeting rules
   */
  matchesTargeting(rules, context) {
    if (!rules || Object.keys(rules).length === 0) {
      return true;
    }

    // Country targeting
    if (rules.countries && !rules.countries.includes(context.country)) {
      return false;
    }

    // Device targeting
    if (rules.devices && !rules.devices.includes(context.device)) {
      return false;
    }

    // User segment targeting
    if (rules.segments && !rules.segments.some(s => context.segments?.includes(s))) {
      return false;
    }

    // Percentage rollout
    if (rules.rolloutPercentage) {
      const userHash = crypto.createHash('md5').update(context.userId || '').digest('hex');
      const userPercentage = (parseInt(userHash.substring(0, 8), 16) % 100) + 1;
      if (userPercentage > rules.rolloutPercentage) {
        return false;
      }
    }

    return true;
  }

  /**
   * Track impression
   */
  trackImpression(experimentId, variantId, userId) {
    const results = this.results.get(experimentId);
    if (results && results.variants[variantId]) {
      results.variants[variantId].impressions++;
      results.variants[variantId].users.add(userId);
    }
  }

  /**
   * Track conversion event
   */
  trackConversion(experimentId, userId, value = 0) {
    const assignmentKey = `${experimentId}:${userId}`;
    const assignment = this.userAssignments.get(assignmentKey);

    if (!assignment) {
      return; // User not in experiment
    }

    const results = this.results.get(experimentId);
    if (results && results.variants[assignment.variant]) {
      results.variants[assignment.variant].conversions++;
      results.variants[assignment.variant].revenue += value;
    }

    console.log(`✓ Conversion tracked: ${experimentId} - ${assignment.variant} - $${value}`);
  }

  /**
   * Track custom metric
   */
  trackMetric(experimentId, userId, metricName, value) {
    const assignmentKey = `${experimentId}:${userId}`;
    const assignment = this.userAssignments.get(assignmentKey);

    if (!assignment) {
      return;
    }

    const results = this.results.get(experimentId);
    if (results && results.variants[assignment.variant]) {
      if (!results.variants[assignment.variant].customMetrics) {
        results.variants[assignment.variant].customMetrics = {};
      }
      
      if (!results.variants[assignment.variant].customMetrics[metricName]) {
        results.variants[assignment.variant].customMetrics[metricName] = [];
      }

      results.variants[assignment.variant].customMetrics[metricName].push(value);
    }
  }

  /**
   * Get experiment results with statistical analysis
   */
  getResults(experimentId) {
    const experiment = this.experiments.get(experimentId);
    const results = this.results.get(experimentId);

    if (!experiment || !results) {
      return null;
    }

    const analysis = {
      experimentId,
      experimentName: experiment.name,
      status: experiment.status,
      duration: this.calculateDuration(experiment),
      variants: {}
    };

    // Calculate metrics for each variant
    for (const [variantId, data] of Object.entries(results.variants)) {
      const conversionRate = data.impressions > 0 
        ? (data.conversions / data.impressions * 100).toFixed(2)
        : 0;
      
      const avgRevenue = data.conversions > 0
        ? (data.revenue / data.conversions).toFixed(2)
        : 0;

      analysis.variants[variantId] = {
        impressions: data.impressions,
        conversions: data.conversions,
        conversionRate: `${conversionRate}%`,
        revenue: data.revenue.toFixed(2),
        avgRevenuePerConversion: avgRevenue,
        uniqueUsers: data.users.size
      };
    }

    // Calculate statistical significance
    analysis.statisticalSignificance = this.calculateSignificance(results.variants);
    analysis.winner = this.determineWinner(analysis.variants, analysis.statisticalSignificance);

    return analysis;
  }

  /**
   * Calculate statistical significance (simplified chi-square test)
   */
  calculateSignificance(variants) {
    const variantIds = Object.keys(variants);
    
    if (variantIds.length < 2) {
      return { significant: false, confidence: 0 };
    }

    const control = variants[variantIds[0]];
    const variant = variants[variantIds[1]];

    if (control.impressions < 100 || variant.impressions < 100) {
      return { 
        significant: false, 
        confidence: 0,
        message: 'Insufficient sample size (minimum 100 impressions per variant)' 
      };
    }

    const controlRate = control.conversions / control.impressions;
    const variantRate = variant.conversions / variant.impressions;

    // Simplified z-test for proportions
    const pooledRate = (control.conversions + variant.conversions) / 
                       (control.impressions + variant.impressions);
    
    const se = Math.sqrt(pooledRate * (1 - pooledRate) * 
                        (1/control.impressions + 1/variant.impressions));
    
    const z = Math.abs(controlRate - variantRate) / se;
    
    // Convert z-score to confidence level (simplified)
    let confidence = 0;
    if (z >= 2.58) confidence = 99;
    else if (z >= 1.96) confidence = 95;
    else if (z >= 1.64) confidence = 90;

    return {
      significant: confidence >= 95,
      confidence,
      zScore: z.toFixed(2),
      improvement: ((variantRate - controlRate) / controlRate * 100).toFixed(2) + '%'
    };
  }

  /**
   * Determine winning variant
   */
  determineWinner(variants, significance) {
    if (!significance.significant) {
      return {
        winner: null,
        message: 'No statistically significant winner yet'
      };
    }

    let bestVariant = null;
    let bestRate = 0;

    for (const [variantId, data] of Object.entries(variants)) {
      const rate = parseFloat(data.conversionRate);
      if (rate > bestRate) {
        bestRate = rate;
        bestVariant = variantId;
      }
    }

    return {
      winner: bestVariant,
      conversionRate: bestRate + '%',
      confidence: significance.confidence + '%',
      message: `${bestVariant} is winning with ${significance.confidence}% confidence`
    };
  }

  /**
   * Stop experiment
   */
  stopExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.status = 'stopped';
      experiment.endDate = new Date();
      console.log(`🛑 Stopped experiment: ${experiment.name}`);
    }
  }

  /**
   * Get all active experiments
   */
  getActiveExperiments() {
    const active = [];
    for (const experiment of this.experiments.values()) {
      if (experiment.status === 'active') {
        active.push(experiment);
      }
    }
    return active;
  }

  calculateDuration(experiment) {
    const end = experiment.endDate || new Date();
    const duration = end - experiment.startDate;
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    return `${days} days`;
  }

  generateExperimentId() {
    return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export results to CSV
   */
  exportResults(experimentId) {
    const results = this.getResults(experimentId);
    if (!results) return null;

    const rows = [
      ['Variant', 'Impressions', 'Conversions', 'Conversion Rate', 'Revenue', 'Avg Revenue']
    ];

    for (const [variantId, data] of Object.entries(results.variants)) {
      rows.push([
        variantId,
        data.impressions,
        data.conversions,
        data.conversionRate,
        data.revenue,
        data.avgRevenuePerConversion
      ]);
    }

    return rows.map(row => row.join(',')).join('\n');
  }
}

module.exports = new ABTestingService();