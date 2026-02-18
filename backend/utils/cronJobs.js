const cron = require('node-cron');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Analytics = require('../models/Analytics');
const Subscription = require('../models/Subscription');
const Coupon = require('../models/Coupon');
const Wishlist = require('../models/Wishlist');
const Notification = require('../models/Notification');
const { sendEmail } = require('./email');

class CronJobs {
  /**
   * Initialize all cron jobs
   */
  static init() {
    console.log('📅 Initializing cron jobs...');

    // Run daily analytics at midnight
    this.dailyAnalytics();

    // Check low stock every hour
    this.checkLowStock();

    // Process subscriptions daily at 2 AM
    this.processSubscriptions();

    // Check expired coupons daily
    this.checkExpiredCoupons();

    // Send abandoned cart emails daily
    this.sendAbandonedCartEmails();

    // Check wishlist price drops every 6 hours
    this.checkWishlistPriceDrops();

    // Clean up old notifications weekly
    this.cleanupNotifications();

    // Generate weekly reports
    this.weeklyReports();

    console.log('✓ Cron jobs initialized');
  }

  /**
   * Generate daily analytics
   * Runs at midnight every day
   */
  static dailyAnalytics() {
    cron.schedule('0 0 * * *', async () => {
      try {
        console.log('Running daily analytics...');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        await Analytics.generateDailyAnalytics(yesterday);
        console.log('✓ Daily analytics completed');
      } catch (error) {
        console.error('Error in daily analytics:', error);
      }
    });
  }

  /**
   * Check low stock products
   * Runs every hour
   */
  static checkLowStock() {
    cron.schedule('0 * * * *', async () => {
      try {
        const lowStockProducts = await Product.find({
          isActive: true,
          $expr: { $lte: ['$stock', '$lowStockThreshold'] }
        }).select('name sku stock lowStockThreshold');

        if (lowStockProducts.length > 0) {
          console.log(`⚠️  ${lowStockProducts.length} products low on stock`);
          
          // Send notification to admin
          // TODO: Implement admin notification
        }
      } catch (error) {
        console.error('Error checking low stock:', error);
      }
    });
  }

  /**
   * Process subscription renewals
   * Runs daily at 2 AM
   */
  static processSubscriptions() {
    cron.schedule('0 2 * * *', async () => {
      try {
        console.log('Processing subscription renewals...');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueSubscriptions = await Subscription.find({
          status: 'active',
          nextBillingDate: { $lte: today }
        });

        let processed = 0;
        let failed = 0;

        for (const subscription of dueSubscriptions) {
          const result = await subscription.processBilling();
          if (result.success) {
            processed++;
          } else {
            failed++;
          }
        }

        console.log(`✓ Subscriptions processed: ${processed}, Failed: ${failed}`);
      } catch (error) {
        console.error('Error processing subscriptions:', error);
      }
    });
  }

  /**
   * Check and deactivate expired coupons
   * Runs daily at 1 AM
   */
  static checkExpiredCoupons() {
    cron.schedule('0 1 * * *', async () => {
      try {
        const result = await Coupon.updateMany(
          {
            isActive: true,
            expirationDate: { $lt: new Date() }
          },
          {
            $set: { isActive: false }
          }
        );

        if (result.modifiedCount > 0) {
          console.log(`✓ ${result.modifiedCount} coupons expired`);
        }
      } catch (error) {
        console.error('Error checking expired coupons:', error);
      }
    });
  }

  /**
   * Send abandoned cart emails
   * Runs daily at 10 AM
   */
  static sendAbandonedCartEmails() {
    cron.schedule('0 10 * * *', async () => {
      try {
        const { Cart } = require('../models/index');
        const User = require('../models/User');

        // Find carts abandoned for 24 hours
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const abandonedCarts = await Cart.find({
          updatedAt: { $lte: oneDayAgo },
          items: { $exists: true, $ne: [] }
        }).populate('user');

        for (const cart of abandonedCarts) {
          if (cart.user && cart.items.length > 0) {
            // Send abandoned cart email
            await sendEmail({
              to: cart.user.email,
              subject: 'You left items in your cart!',
              html: `
                <h1>Don't forget your items!</h1>
                <p>Hi ${cart.user.firstName},</p>
                <p>You have ${cart.items.length} items waiting in your cart.</p>
                <p><a href="${process.env.FRONTEND_URL}/cart">Complete your purchase</a></p>
              `
            });
          }
        }

        console.log(`✓ Sent ${abandonedCarts.length} abandoned cart emails`);
      } catch (error) {
        console.error('Error sending abandoned cart emails:', error);
      }
    });
  }

  /**
   * Check wishlist for price drops
   * Runs every 6 hours
   */
  static checkWishlistPriceDrops() {
    cron.schedule('0 */6 * * *', async () => {
      try {
        const wishlists = await Wishlist.find({}).populate('user');

        for (const wishlist of wishlists) {
          const priceDrops = await wishlist.checkPriceDrops();
          
          if (priceDrops.length > 0 && wishlist.user) {
            // Send price drop notification
            for (const drop of priceDrops) {
              await Notification.create({
                user: wishlist.user._id,
                type: 'price_drop',
                title: 'Price Drop Alert!',
                message: `${drop.product.name} is now ${drop.dropPercentage}% off!`,
                product: drop.product._id,
                channels: ['email', 'in_app'],
                actionUrl: `/products/${drop.product.slug}`
              });
            }
          }
        }

        console.log('✓ Checked wishlist price drops');
      } catch (error) {
        console.error('Error checking wishlist price drops:', error);
      }
    });
  }

  /**
   * Clean up old notifications
   * Runs weekly on Sunday at 3 AM
   */
  static cleanupNotifications() {
    cron.schedule('0 3 * * 0', async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await Notification.deleteMany({
          read: true,
          createdAt: { $lt: thirtyDaysAgo }
        });

        console.log(`✓ Deleted ${result.deletedCount} old notifications`);
      } catch (error) {
        console.error('Error cleaning up notifications:', error);
      }
    });
  }

  /**
   * Generate weekly reports
   * Runs every Monday at 9 AM
   */
  static weeklyReports() {
    cron.schedule('0 9 * * 1', async () => {
      try {
        console.log('Generating weekly reports...');

        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);

        const [orders, revenue, newCustomers] = await Promise.all([
          Order.countDocuments({ createdAt: { $gte: lastWeek } }),
          Order.aggregate([
            { $match: { createdAt: { $gte: lastWeek }, paymentStatus: 'paid' } },
            { $group: { _id: null, total: { $sum: '$total' } } }
          ]),
          User.countDocuments({ createdAt: { $gte: lastWeek }, role: 'user' })
        ]);

        console.log('Weekly Report:');
        console.log(`- Orders: ${orders}`);
        console.log(`- Revenue: $${revenue[0]?.total || 0}`);
        console.log(`- New Customers: ${newCustomers}`);

        // TODO: Send email to admin with weekly report
      } catch (error) {
        console.error('Error generating weekly reports:', error);
      }
    });
  }
}

module.exports = CronJobs;