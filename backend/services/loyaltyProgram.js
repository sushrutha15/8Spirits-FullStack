const mongoose = require('mongoose');

/**
 * Loyalty Program Service
 * Handles points, tiers, rewards, and customer loyalty management
 */

class LoyaltyService {
  /**
   * Initialize loyalty program for a user
   */
  static async initializeForUser(userId) {
    const User = require('../models/User');
    
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize loyalty points if not exists
    if (!user.loyaltyPoints) {
      user.loyaltyPoints = {
        points: 0,
        totalPointsEarned: 0,
        totalPointsRedeemed: 0,
        tier: 'bronze',
        tierHistory: [{
          tier: 'bronze',
          earnedAt: new Date()
        }],
        pointsHistory: [],
        rewards: [],
        referralCode: this.generateReferralCode(),
        referredBy: null
      };
      await user.save();
    }

    return user.loyaltyPoints;
  }

  /**
   * Generate unique referral code
   */
  static generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Calculate points earned for an order
   */
  static calculatePointsForOrder(orderTotal, tier = 'bronze') {
    // Base points rate: 1 point per $1
    let pointsRate = 1;

    // Tier multipliers
    const tierMultipliers = {
      bronze: 1,
      silver: 1.25,
      gold: 1.5,
      platinum: 2,
      diamond: 3
    };

    pointsRate *= tierMultipliers[tier] || 1;

    // Round to nearest integer
    return Math.floor(orderTotal * pointsRate);
  }

  /**
   * Award points for an order
   */
  static async awardPointsForOrder(userId, orderId, orderTotal) {
    const User = require('../models/User');
    
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize loyalty if not exists
    if (!user.loyaltyPoints) {
      await this.initializeForUser(userId);
    }

    const pointsEarned = this.calculatePointsForOrder(orderTotal, user.loyaltyPoints.tier);

    // Update user loyalty points
    user.loyaltyPoints.points += pointsEarned;
    user.loyaltyPoints.totalPointsEarned += pointsEarned;

    // Add to history
    user.loyaltyPoints.pointsHistory.push({
      type: 'earned',
      points: pointsEarned,
      orderId,
      description: `Points earned from order`,
      date: new Date()
    });

    // Check for tier upgrade
    await this.checkAndUpgradeTier(user);

    await user.save();

    return {
      pointsEarned,
      totalPoints: user.loyaltyPoints.points,
      tier: user.loyaltyPoints.tier
    };
  }

  /**
   * Redeem points
   */
  static async redeemPoints(userId, points, description = 'Redemption') {
    const User = require('../models/User');
    
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.loyaltyPoints || user.loyaltyPoints.points < points) {
      throw new Error('Insufficient points');
    }

    user.loyaltyPoints.points -= points;
    user.loyaltyPoints.totalPointsRedeemed += points;

    // Add to history
    user.loyaltyPoints.pointsHistory.push({
      type: 'redeemed',
      points: -points,
      description,
      date: new Date()
    });

    // Check for tier downgrade (optional - usually loyalty programs don't downgrade)
    // await this.checkTierDowngrade(user);

    await user.save();

    return {
      pointsRedeemed: points,
      remainingPoints: user.loyaltyPoints.points,
      tier: user.loyaltyPoints.tier
    };
  }

  /**
   * Check and upgrade tier based on total points earned
   */
  static async checkAndUpgradeTier(user) {
    const totalPoints = user.loyaltyPoints.totalPointsEarned;
    let newTier = 'bronze';

    // Tier thresholds
    const tierThresholds = {
      diamond: 50000,
      platinum: 25000,
      gold: 10000,
      silver: 2500,
      bronze: 0
    };

    // Determine new tier
    if (totalPoints >= tierThresholds.diamond) {
      newTier = 'diamond';
    } else if (totalPoints >= tierThresholds.platinum) {
      newTier = 'platinum';
    } else if (totalPoints >= tierThresholds.gold) {
      newTier = 'gold';
    } else if (totalPoints >= tierThresholds.silver) {
      newTier = 'silver';
    }

    // Upgrade if needed
    const currentTierIndex = ['bronze', 'silver', 'gold', 'platinum', 'diamond'].indexOf(user.loyaltyPoints.tier);
    const newTierIndex = ['bronze', 'silver', 'gold', 'platinum', 'diamond'].indexOf(newTier);

    if (newTierIndex > currentTierIndex) {
      user.loyaltyPoints.tier = newTier;
      user.loyaltyPoints.tierHistory.push({
        tier: newTier,
        earnedAt: new Date()
      });

      // Award tier bonus points
      const tierBonusPoints = {
        silver: 100,
        gold: 250,
        platinum: 500,
        diamond: 1000
      };

      if (tierBonusPoints[newTier]) {
        user.loyaltyPoints.points += tierBonusPoints[newTier];
        user.loyaltyPoints.totalPointsEarned += tierBonusPoints[newTier];
        user.loyaltyPoints.pointsHistory.push({
          type: 'bonus',
          points: tierBonusPoints[newTier],
          description: `Tier upgrade bonus: ${newTier}`,
          date: new Date()
        });
      }
    }

    return user.loyaltyPoints.tier;
  }

  /**
   * Get available rewards for user's tier
   */
  static getAvailableRewards(tier) {
    const rewards = [
      {
        id: 'discount_5',
        name: '$5 Off',
        description: '$5 discount on your next order',
        pointsCost: 100,
        type: 'discount',
        value: 5,
        tiers: ['bronze', 'silver', 'gold', 'platinum', 'diamond']
      },
      {
        id: 'discount_10',
        name: '$10 Off',
        description: '$10 discount on your next order',
        pointsCost: 180,
        type: 'discount',
        value: 10,
        tiers: ['silver', 'gold', 'platinum', 'diamond']
      },
      {
        id: 'discount_25',
        name: '$25 Off',
        description: '$25 discount on your next order',
        pointsCost: 400,
        type: 'discount',
        value: 25,
        tiers: ['gold', 'platinum', 'diamond']
      },
      {
        id: 'free_shipping',
        name: 'Free Shipping',
        description: 'Free shipping on your next order',
        pointsCost: 150,
        type: 'shipping',
        value: 1,
        tiers: ['bronze', 'silver', 'gold', 'platinum', 'diamond']
      },
      {
        id: 'free_product',
        name: 'Free Product',
        description: 'Choose a free product (up to $20 value)',
        pointsCost: 500,
        type: 'product',
        value: 20,
        tiers: ['gold', 'platinum', 'diamond']
      },
      {
        id: 'birthday_bonus',
        name: 'Birthday Bonus',
        description: 'Double points on your birthday month',
        pointsCost: 0,
        type: 'bonus',
        value: 2,
        tiers: ['bronze', 'silver', 'gold', 'platinum', 'diamond']
      }
    ];

    return rewards.filter(r => r.tiers.includes(tier));
  }

  /**
   * Claim a reward
   */
  static async claimReward(userId, rewardId) {
    const User = require('../models/User');
    
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.loyaltyPoints) {
      await this.initializeForUser(userId);
    }

    const availableRewards = this.getAvailableRewards(user.loyaltyPoints.tier);
    const reward = availableRewards.find(r => r.id === rewardId);

    if (!reward) {
      throw new Error('Reward not available for your tier');
    }

    if (user.loyaltyPoints.points < reward.pointsCost) {
      throw new Error('Insufficient points');
    }

    // Deduct points
    user.loyaltyPoints.points -= reward.pointsCost;
    user.loyaltyPoints.totalPointsRedeemed += reward.pointsCost;

    // Add reward to user's rewards
    user.loyaltyPoints.rewards.push({
      rewardId: reward.id,
      name: reward.name,
      description: reward.description,
      claimedAt: new Date(),
      usedAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days expiry
      status: 'available'
    });

    // Add to history
    user.loyaltyPoints.pointsHistory.push({
      type: 'redeemed',
      points: -reward.pointsCost,
      description: `Redeemed: ${reward.name}`,
      date: new Date()
    });

    await user.save();

    return {
      reward: user.loyaltyPoints.rewards[user.loyaltyPoints.rewards.length - 1],
      remainingPoints: user.loyaltyPoints.points
    };
  }

  /**
   * Use a reward
   */
  static async useReward(userId, rewardClaimId) {
    const User = require('../models/User');
    
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const rewardIndex = user.loyaltyPoints.rewards.findIndex(
      r => r._id.toString() === rewardClaimId && r.status === 'available'
    );

    if (rewardIndex === -1) {
      throw new Error('Reward not found or already used');
    }

    const reward = user.loyaltyPoints.rewards[rewardIndex];

    // Check if expired
    if (reward.expiresAt && new Date(reward.expiresAt) < new Date()) {
      throw new Error('Reward has expired');
    }

    // Mark as used
    user.loyaltyPoints.rewards[rewardIndex].usedAt = new Date();
    user.loyaltyPoints.rewards[rewardIndex].status = 'used';

    await user.save();

    return user.loyaltyPoints.rewards[rewardIndex];
  }

  /**
   * Get loyalty status for a user
   */
  static async getLoyaltyStatus(userId) {
    const User = require('../models/User');
    
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.loyaltyPoints) {
      await this.initializeForUser(userId);
    }

    const loyalty = user.loyaltyPoints;
    const availableRewards = this.getAvailableRewards(loyalty.tier);

    // Calculate points to next tier
    const tierThresholds = {
      diamond: 50000,
      platinum: 25000,
      gold: 10000,
      silver: 2500,
      bronze: 0
    };

    const tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
    const currentTierIndex = tiers.indexOf(loyalty.tier);
    const nextTier = currentTierIndex < tiers.length - 1 ? tiers[currentTierIndex + 1] : null;
    const pointsToNextTier = nextTier 
      ? tierThresholds[nextTier] - loyalty.totalPointsEarned 
      : 0;

    // Calculate progress to next tier
    const currentTierThreshold = tierThresholds[loyalty.tier];
    const tierRange = nextTier 
      ? tierThresholds[nextTier] - currentTierThreshold 
      : 0;
    const progressInTier = tierRange > 0 
      ? ((loyalty.totalPointsEarned - currentTierThreshold) / tierRange * 100).toFixed(1)
      : 100;

    return {
      points: loyalty.points,
      totalPointsEarned: loyalty.totalPointsEarned,
      totalPointsRedeemed: loyalty.totalPointsRedeemed,
      tier: loyalty.tier,
      tierHistory: loyalty.tierHistory,
      pointsHistory: loyalty.pointsHistory.slice(-10), // Last 10 transactions
      availableRewards,
      rewards: loyalty.rewards,
      referralCode: loyalty.referralCode,
      pointsToNextTier: Math.max(0, pointsToNextTier),
      progressToNextTier: progressInTier,
      nextTier
    };
  }

  /**
   * Process referral
   */
  static async processReferral(referrerId, referredUserId) {
    const User = require('../models/User');
    
    const referrer = await User.findById(referrerId);
    const referred = await User.findById(referredUserId);

    if (!referrer || !referred) {
      throw new Error('User not found');
    }

    // Check if referred user already has a referrer
    if (referred.loyaltyPoints?.referredBy) {
      throw new Error('User already referred');
    }

    // Update referred user
    if (!referred.loyaltyPoints) {
      await this.initializeForUser(referredUserId);
    }
    referred.loyaltyPoints.referredBy = referrerId;
    await referred.save();

    // Award bonus points to both
    const referralBonus = 200; // Points for both

    // Award to referrer
    if (!referrer.loyaltyPoints) {
      await this.initializeForUser(referrerId);
    }
    referrer.loyaltyPoints.points += referralBonus;
    referrer.loyaltyPoints.totalPointsEarned += referralBonus;
    referrer.loyaltyPoints.pointsHistory.push({
      type: 'bonus',
      points: referralBonus,
      description: `Referral bonus: ${referred.email}`,
      date: new Date()
    });
    await referrer.save();

    // Award to referred
    referred.loyaltyPoints.points += referralBonus;
    referred.loyaltyPoints.totalPointsEarned += referralBonus;
    referred.loyaltyPoints.pointsHistory.push({
      type: 'bonus',
      points: referralBonus,
      description: `Welcome bonus from referral`,
      date: new Date()
    });
    await referred.save();

    return {
      referrerBonus: referralBonus,
      referredBonus: referralBonus
    };
  }

  /**
   * Get tier benefits
   */
  static getTierBenefits(tier) {
    const benefits = {
      bronze: {
        pointsMultiplier: 1,
        pointsRate: '1 point per $1',
        birthdayBonus: '1.5x points',
        freeShippingThreshold: 75,
        earlyAccess: false,
        exclusiveDeals: false,
        dedicatedSupport: false,
        annualBonusPoints: 50
      },
      silver: {
        pointsMultiplier: 1.25,
        pointsRate: '1.25 points per $1',
        birthdayBonus: '2x points',
        freeShippingThreshold: 50,
        earlyAccess: false,
        exclusiveDeals: false,
        dedicatedSupport: false,
        annualBonusPoints: 150
      },
      gold: {
        pointsMultiplier: 1.5,
        pointsRate: '1.5 points per $1',
        birthdayBonus: '2.5x points',
        freeShippingThreshold: 35,
        earlyAccess: true,
        exclusiveDeals: true,
        dedicatedSupport: false,
        annualBonusPoints: 350
      },
      platinum: {
        pointsMultiplier: 2,
        pointsRate: '2 points per $1',
        birthdayBonus: '3x points',
        freeShippingThreshold: 0,
        earlyAccess: true,
        exclusiveDeals: true,
        dedicatedSupport: true,
        annualBonusPoints: 750
      },
      diamond: {
        pointsMultiplier: 3,
        pointsRate: '3 points per $1',
        birthdayBonus: '4x points',
        freeShippingThreshold: 0,
        earlyAccess: true,
        exclusiveDeals: true,
        dedicatedSupport: true,
        annualBonusPoints: 1500
      }
    };

    return benefits[tier] || benefits.bronze;
  }
}

module.exports = LoyaltyService;

