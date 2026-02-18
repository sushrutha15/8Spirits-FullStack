const mongoose = require('mongoose');

/**
 * MongoDB Database Configuration
 * Handles connection, events, and error handling
 */

const connectDB = async () => {
  try {
    const options = {
      autoIndex: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    };

    const conn = await mongoose.connect(process.env.MONGO_URI, options);

    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
    console.log(`✓ Database: ${conn.connection.name}`);

    mongoose.connection.on('connected', () => {
      console.log('✓ Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('✗ Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  Mongoose disconnected from MongoDB');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('✓ Mongoose connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    console.error('✗ MongoDB Connection Failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

/**
 * Test database connection
 */
const testConnection = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('✓ Database connection is active');
      return true;
    } else {
      console.warn('⚠️  Database connection is not active');
      return false;
    }
  } catch (error) {
    console.error('✗ Database connection test failed:', error.message);
    return false;
  }
};

/**
 * Get database statistics
 */
const getDatabaseStats = async () => {
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.serverInfo();
    const stats = await mongoose.connection.db.stats();
    
    return {
      serverInfo: {
        version: info.version,
        uptime: info.uptime
      },
      stats: {
        collections: stats.collections,
        dataSize: `${(stats.dataSize / (1024 * 1024)).toFixed(2)} MB`,
        indexSize: `${(stats.indexSize / (1024 * 1024)).toFixed(2)} MB`,
        storageSize: `${(stats.storageSize / (1024 * 1024)).toFixed(2)} MB`
      }
    };
  } catch (error) {
    console.error('Error getting database stats:', error.message);
    return null;
  }
};

module.exports = {
  connectDB,
  testConnection,
  getDatabaseStats,
  mongoose
};