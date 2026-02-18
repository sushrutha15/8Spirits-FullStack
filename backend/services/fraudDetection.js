const geoip = require('geoip-lite');

class FraudDetectionService {
  constructor() {
    this.blacklistedIPs = new Set();
    this.suspiciousEmails = new Set();
    this.velocityLimits = new Map();
    this.deviceFingerprints = new Map();
  }

  /**
   * Comprehensive fraud analysis
   */
  async analyzeOrder(order, user, request) {
    const checks = {
      velocityCheck: await this.checkVelocity(user._id),
      ipReputationCheck: await this.checkIPReputation(request.ip),
      emailCheck: await this.checkEmailReputation(user.email),
      deviceCheck: await this.checkDeviceFingerprint(request),
      addressCheck: await this.checkAddressMismatch(order),
      amountCheck: await this.checkAbnormalAmount(order, user),
      behaviorCheck: await this.checkBehavioralPatterns(user, order),
      geolocationCheck: await this.checkGeolocation(order, request.ip),
      cardCheck: await this.checkCardFingerprint(order.paymentDetails)
    };

    const riskScore = this.calculateRiskScore(checks);
    const riskLevel = this.getRiskLevel(riskScore);

    const analysis = {
      riskScore,
      riskLevel,
      checks,
      flags: this.extractFlags(checks),
      recommendation: this.getRecommendation(riskLevel, checks),
      timestamp: new Date()
    };

    // Log suspicious activity
    if (riskLevel === 'high' || riskLevel === 'critical') {
      await this.logSuspiciousActivity(order, user, analysis);
    }

    return analysis;
  }

  /**
   * Velocity check - detect rapid successive orders
   */
  async checkVelocity(userId) {
    const key = `velocity:${userId}`;
    const now = Date.now();
    const timeWindow = 3600000; // 1 hour
    
    if (!this.velocityLimits.has(key)) {
      this.velocityLimits.set(key, []);
    }

    const timestamps = this.velocityLimits.get(key);
    
    // Remove old timestamps
    const recentTimestamps = timestamps.filter(t => now - t < timeWindow);
    this.velocityLimits.set(key, [...recentTimestamps, now]);

    const ordersInLastHour = recentTimestamps.length;

    return {
      passed: ordersInLastHour < 5,
      ordersInLastHour,
      suspiciousIfFailed: ordersInLastHour >= 10,
      score: Math.min(ordersInLastHour * 10, 100)
    };
  }

  /**
   * IP reputation check
   */
  async checkIPReputation(ip) {
    const isBlacklisted = this.blacklistedIPs.has(ip);
    const geo = geoip.lookup(ip);
    
    // Check if IP is from high-risk country
    const highRiskCountries = ['NG', 'RU', 'CN', 'IN', 'PK'];
    const isHighRiskCountry = geo && highRiskCountries.includes(geo.country);

    // Check if using proxy/VPN (simplified check)
    const isProxy = ip.startsWith('10.') || ip.startsWith('192.168.');

    return {
      passed: !isBlacklisted && !isProxy,
      isBlacklisted,
      isProxy,
      isHighRiskCountry,
      country: geo?.country,
      score: (isBlacklisted ? 80 : 0) + (isProxy ? 40 : 0) + (isHighRiskCountry ? 20 : 0)
    };
  }

  /**
   * Email reputation check
   */
  async checkEmailReputation(email) {
    const domain = email.split('@')[1];
    
    // Check disposable email domains
    const disposableDomains = [
      'tempmail.com', 'guerrillamail.com', '10minutemail.com',
      'throwaway.email', 'mailinator.com', 'trashmail.com'
    ];
    const isDisposable = disposableDomains.includes(domain);
    
    const isSuspicious = this.suspiciousEmails.has(email);

    return {
      passed: !isDisposable && !isSuspicious,
      isDisposable,
      isSuspicious,
      domain,
      score: (isDisposable ? 60 : 0) + (isSuspicious ? 80 : 0)
    };
  }

  /**
   * Device fingerprint check
   */
  async checkDeviceFingerprint(request) {
    const fingerprint = this.generateFingerprint(request);
    const deviceHistory = this.deviceFingerprints.get(fingerprint) || [];
    
    const multipleAccounts = deviceHistory.length > 3;
    
    deviceHistory.push({
      timestamp: Date.now(),
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });
    
    this.deviceFingerprints.set(fingerprint, deviceHistory);

    return {
      passed: !multipleAccounts,
      fingerprint,
      accountsOnDevice: deviceHistory.length,
      score: multipleAccounts ? 50 : 0
    };
  }

  /**
   * Address mismatch check
   */
  async checkAddressMismatch(order) {
    if (!order.billingAddress || !order.shippingAddress) {
      return { passed: true, score: 0 };
    }

    const billing = order.billingAddress;
    const shipping = order.shippingAddress;

    const cityMismatch = billing.city !== shipping.city;
    const stateMismatch = billing.state !== shipping.state;
    const countryMismatch = billing.country !== shipping.country;

    const anyMismatch = cityMismatch || stateMismatch || countryMismatch;

    return {
      passed: !anyMismatch,
      cityMismatch,
      stateMismatch,
      countryMismatch,
      score: anyMismatch ? 30 : 0
    };
  }

  /**
   * Abnormal amount check
   */
  async checkAbnormalAmount(order, user) {
    const Order = require('../models/Order');
    
    // Get user's average order value
    const pastOrders = await Order.find({
      user: user._id,
      orderStatus: 'delivered'
    }).select('total').limit(10);

    if (pastOrders.length === 0) {
      // First order - check if unusually high
      const isHighForFirstOrder = order.total > 500;
      return {
        passed: !isHighForFirstOrder,
        isFirstOrder: true,
        orderTotal: order.total,
        score: isHighForFirstOrder ? 40 : 0
      };
    }

    const avgOrderValue = pastOrders.reduce((sum, o) => sum + o.total, 0) / pastOrders.length;
    const deviation = Math.abs(order.total - avgOrderValue) / avgOrderValue;
    
    // Flag if current order is 3x higher than average
    const isAbnormal = deviation > 2;

    return {
      passed: !isAbnormal,
      orderTotal: order.total,
      averageOrderValue: avgOrderValue,
      deviation: (deviation * 100).toFixed(2) + '%',
      score: isAbnormal ? 50 : 0
    };
  }

  /**
   * Behavioral pattern analysis
   */
  async checkBehavioralPatterns(user, order) {
    const suspiciousPatterns = [];

    // Check account age
    const accountAge = Date.now() - new Date(user.createdAt).getTime();
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
    
    if (accountAgeDays < 1 && order.total > 200) {
      suspiciousPatterns.push('new_account_high_value');
    }

    // Check if email is verified
    if (!user.isVerified && order.total > 100) {
      suspiciousPatterns.push('unverified_email');
    }

    // Check for multiple payment failures
    if (user.failedPaymentAttempts && user.failedPaymentAttempts > 3) {
      suspiciousPatterns.push('multiple_payment_failures');
    }

    return {
      passed: suspiciousPatterns.length === 0,
      accountAgeDays: Math.floor(accountAgeDays),
      patterns: suspiciousPatterns,
      score: suspiciousPatterns.length * 20
    };
  }

  /**
   * Geolocation check
   */
  async checkGeolocation(order, ip) {
    const geo = geoip.lookup(ip);
    const shippingCountry = order.shippingAddress?.country;

    if (!geo || !shippingCountry) {
      return { passed: true, score: 0 };
    }

    const countryMismatch = geo.country !== shippingCountry;

    return {
      passed: !countryMismatch,
      ipCountry: geo.country,
      shippingCountry,
      countryMismatch,
      score: countryMismatch ? 30 : 0
    };
  }

  /**
   * Card fingerprint check
   */
  async checkCardFingerprint(paymentDetails) {
    if (!paymentDetails || !paymentDetails.last4) {
      return { passed: true, score: 0 };
    }

    // Check if card has been used with multiple accounts (simplified)
    const cardFingerprint = paymentDetails.last4;
    
    return {
      passed: true,
      cardFingerprint,
      score: 0
    };
  }

  /**
   * Calculate overall risk score
   */
  calculateRiskScore(checks) {
    let totalScore = 0;
    let count = 0;

    for (const check of Object.values(checks)) {
      if (check && typeof check.score === 'number') {
        totalScore += check.score;
        count++;
      }
    }

    return count > 0 ? Math.min(Math.round(totalScore / count), 100) : 0;
  }

  /**
   * Determine risk level
   */
  getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'minimal';
  }

  /**
   * Extract flags from checks
   */
  extractFlags(checks) {
    const flags = [];

    for (const [checkName, result] of Object.entries(checks)) {
      if (result && !result.passed) {
        flags.push(checkName.replace('Check', ''));
      }
    }

    return flags;
  }

  /**
   * Get recommendation based on risk
   */
  getRecommendation(riskLevel, checks) {
    const recommendations = {
      critical: 'BLOCK - High fraud risk detected. Manual review required.',
      high: 'REVIEW - Multiple risk factors present. Recommend manual verification.',
      medium: 'MONITOR - Some risk factors detected. Enhanced monitoring suggested.',
      low: 'ACCEPT - Low risk. Standard processing.',
      minimal: 'ACCEPT - Minimal risk. Normal processing.'
    };

    return recommendations[riskLevel];
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(order, user, analysis) {
    const FraudLog = require('../models/FraudLog');
    
    await FraudLog.create({
      order: order._id,
      user: user._id,
      riskScore: analysis.riskScore,
      riskLevel: analysis.riskLevel,
      flags: analysis.flags,
      checks: analysis.checks,
      recommendation: analysis.recommendation,
      timestamp: new Date()
    });

    // Emit event for real-time monitoring
    const { messageQueue, Events } = require('./messageQueue');
    await messageQueue.publish('fraud', {
      type: Events.FRAUD_DETECTED,
      data: {
        orderId: order._id,
        userId: user._id,
        riskLevel: analysis.riskLevel,
        riskScore: analysis.riskScore
      }
    }, { priority: 'high' });
  }

  /**
   * Generate device fingerprint
   */
  generateFingerprint(request) {
    const crypto = require('crypto');
    const components = [
      request.headers['user-agent'],
      request.headers['accept-language'],
      request.headers['accept-encoding']
    ].join('|');

    return crypto.createHash('md5').update(components).digest('hex');
  }

  /**
   * Blacklist IP
   */
  blacklistIP(ip) {
    this.blacklistedIPs.add(ip);
  }

  /**
   * Mark email as suspicious
   */
  flagEmail(email) {
    this.suspiciousEmails.add(email);
  }
}

module.exports = new FraudDetectionService();