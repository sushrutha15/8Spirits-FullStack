/**
 * 8 Spirits E-commerce Backend
 * Server Entry Point with MongoDB
 * Total Wine Level Features
 * 
 * This file handles:
 * - Server initialization and configuration
 * - MongoDB connection and health monitoring
 * - Graceful shutdown procedures
 * - Error handling and logging
 * - Process management and cleanup
 * - Cron job initialization
 * - Socket.IO setup for real-time features
 * - Redis connection for caching
 * - Background job queue initialization
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Import app
const app = require('./app');

// Import database
const { connectDB, mongoose } = require('./config/database');

// Import all models to ensure they're loaded
require('./models/User');
require('./models/Product');
require('./models/index');

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';
const ENABLE_CRON = process.env.ENABLE_CRON_JOBS !== 'false';

// =============================================================================
// CREATE SERVER
// =============================================================================

let server;

if (ENABLE_HTTPS) {
  try {
    const privateKey = fs.readFileSync(
      process.env.SSL_KEY_PATH || './ssl/key.pem',
      'utf8'
    );
    const certificate = fs.readFileSync(
      process.env.SSL_CERT_PATH || './ssl/cert.pem',
      'utf8'
    );
    const credentials = { key: privateKey, cert: certificate };
    
    server = https.createServer(credentials, app);
    console.log('🔒 HTTPS server configured');
  } catch (error) {
    console.warn('⚠️  HTTPS configuration failed, falling back to HTTP');
    console.warn('   Error:', error.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// =============================================================================
// SOCKET.IO SETUP (Real-time Features)
// =============================================================================

const io = require('socket.io')(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });

  // Join user-specific room
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`User ${userId} joined their room`);
  });
});

// Make io accessible to routes
app.set('io', io);

// =============================================================================
// REDIS CONNECTION (Caching)
// =============================================================================

let redisClient = null;

if (process.env.REDIS_HOST) {
  try {
    const Redis = require('ioredis');
    redisClient = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    redisClient.on('connect', () => {
      console.log('✓ Redis connected');
    });

    redisClient.on('error', (err) => {
      console.error('✗ Redis error:', err.message);
    });

    app.set('redis', redisClient);
  } catch (error) {
    console.warn('⚠️  Redis connection failed:', error.message);
  }
}

// =============================================================================
// BACKGROUND JOB QUEUE (Bull)
// =============================================================================

let emailQueue = null;

if (process.env.REDIS_HOST) {
  try {
    const Queue = require('bull');
    
    emailQueue = new Queue('email', {
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined
      }
    });

    // Process email jobs
    emailQueue.process(async (job) => {
      const { sendEmail } = require('./utils/email');
      await sendEmail(job.data);
      return { sent: true };
    });

    emailQueue.on('completed', (job) => {
      console.log(`✓ Email job ${job.id} completed`);
    });

    emailQueue.on('failed', (job, err) => {
      console.error(`✗ Email job ${job.id} failed:`, err.message);
    });

    app.set('emailQueue', emailQueue);
    console.log('✓ Email queue initialized');
  } catch (error) {
    console.warn('⚠️  Email queue initialization failed:', error.message);
  }
}

// =============================================================================
// SERVER STARTUP
// =============================================================================

const startServer = async () => {
  try {
    console.clear();
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                                                               ║');
    console.log('║                    🥃 8 SPIRITS API 🥃                        ║');
    console.log('║          Premium Spirits E-commerce Platform                  ║');
    console.log('║                                                               ║');
    console.log('║                                                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log();
    console.log('🚀 Starting server initialization...\n');
    
    // Step 1: Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await connectDB();
    console.log();
    
    // Step 2: Initialize Cron Jobs
    if (ENABLE_CRON) {
      console.log('📅 Initializing cron jobs...');
      const CronJobs = require('./utils/cronJobs');
      CronJobs.init();
      console.log();
    }
    
    // Step 3: Start HTTP/HTTPS server
    await new Promise((resolve, reject) => {
      server.listen(PORT, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Step 4: Display server information
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    ✓ SERVER RUNNING                           ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log();
    console.log('📡 Server Details:');
    console.log('   ├─ Environment:', NODE_ENV);
    console.log('   ├─ Protocol:', ENABLE_HTTPS ? 'HTTPS' : 'HTTP');
    console.log('   ├─ Port:', PORT);
    console.log('   ├─ PID:', process.pid);
    console.log('   └─ Node Version:', process.version);
    console.log();
    console.log('🌐 Endpoints:');
    console.log('   ├─ API v1:', `http://localhost:${PORT}/api/v1`);
    console.log('   ├─ API (legacy):', `http://localhost:${PORT}/api`);
    console.log('   ├─ Health:', `http://localhost:${PORT}/health`);
    console.log('   ├─ Docs:', `http://localhost:${PORT}/api/docs`);
    console.log('   ├─ Swagger:', `http://localhost:${PORT}/api-docs`);
    console.log('   └─ Metrics:', `http://localhost:${PORT}/api/metrics`);
    console.log();
    console.log('📊 Database:');
    console.log('   ├─ Type:', 'MongoDB');
    console.log('   ├─ Host:', mongoose.connection.host);
    console.log('   ├─ Database:', mongoose.connection.name);
    console.log('   ├─ State:', mongoose.connection.readyState === 1 ? 'Connected ✓' : 'Disconnected ✗');
    console.log('   └─ Collections:', Object.keys(mongoose.connection.collections).length);
    console.log();
    console.log('🔐 Security Features:');
    console.log('   ├─ JWT Authentication:', 'Enabled ✓');
    console.log('   ├─ Rate Limiting:', 'Enabled ✓');
    console.log('   ├─ Helmet (Security Headers):', 'Enabled ✓');
    console.log('   ├─ CORS:', 'Enabled ✓');
    console.log('   ├─ XSS Protection:', 'Enabled ✓');
    console.log('   ├─ NoSQL Injection Protection:', 'Enabled ✓');
    console.log('   ├─ HPP (Parameter Pollution):', 'Enabled ✓');
    console.log('   └─ Compression:', 'Enabled ✓');
    console.log();
    console.log('🎯 Advanced Features:');
    console.log('   ├─ Product Management (Variants):', 'Enabled ✓');
    console.log('   ├─ Multi-warehouse Inventory:', 'Enabled ✓');
    console.log('   ├─ Order Processing & Tracking:', 'Enabled ✓');
    console.log('   ├─ Subscription System:', 'Enabled ✓');
    console.log('   ├─ Coupon & Discount System:', 'Enabled ✓');
    console.log('   ├─ Gift Card System:', 'Enabled ✓');
    console.log('   ├─ Loyalty Program:', 'Enabled ✓');
    console.log('   ├─ Review & Rating System:', 'Enabled ✓');
    console.log('   ├─ Store Locator:', 'Enabled ✓');
    console.log('   ├─ Recommendation Engine:', 'Enabled ✓');
    console.log('   ├─ Advanced Search & Filters:', 'Enabled ✓');
    console.log('   ├─ Analytics & Reporting:', 'Enabled ✓');
    console.log('   ├─ Notification System:', 'Enabled ✓');
    console.log('   ├─ Real-time Updates (Socket.IO):', 'Enabled ✓');
    console.log('   ├─ Redis Caching:', redisClient ? 'Enabled ✓' : 'Disabled ✗');
    console.log('   ├─ Background Jobs (Bull):', emailQueue ? 'Enabled ✓' : 'Disabled ✗');
    console.log('   └─ Automated Tasks (Cron):', ENABLE_CRON ? 'Enabled ✓' : 'Disabled ✗');
    console.log();
    console.log('💳 Payment Integration:');
    console.log('   └─ Stripe:', process.env.STRIPE_SECRET_KEY ? 'Configured ✓' : 'Not Configured ✗');
    console.log();
    console.log('📧 Notification Channels:');
    console.log('   ├─ Email (SMTP):', process.env.SMTP_HOST ? 'Configured ✓' : 'Not Configured ✗');
    console.log('   ├─ SMS (Twilio):', process.env.TWILIO_ACCOUNT_SID ? 'Configured ✓' : 'Not Configured ✗');
    console.log('   └─ Push (Firebase):', process.env.FIREBASE_PROJECT_ID ? 'Configured ✓' : 'Not Configured ✗');
    console.log();
    console.log('☁️  Cloud Services:');
    console.log('   ├─ Cloudinary (Images):', process.env.CLOUDINARY_CLOUD_NAME ? 'Configured ✓' : 'Not Configured ✗');
    console.log('   └─ AWS S3 (Storage):', process.env.AWS_ACCESS_KEY_ID ? 'Configured ✓' : 'Not Configured ✗');
    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();
    console.log('💡 Tips:');
    console.log('   • Press CTRL+C to stop the server gracefully');
    console.log('   • Visit /api-docs for interactive API documentation');
    console.log('   • Check /health for system health status');
    console.log('   • Monitor /api/metrics for performance metrics');
    console.log();
    console.log('🎉 Server is ready to accept connections!');
    console.log();
    
    // Log startup time
    const startupTime = process.uptime();
    console.log(`⚡ Startup completed in ${startupTime.toFixed(2)}s`);
    console.log();
    
  } catch (error) {
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║                    ✗ STARTUP FAILED                           ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error();
    console.error('❌ Error:', error.message);
    console.error();
    console.error('📋 Stack trace:');
    console.error(error.stack);
    console.error();
    
    // Provide helpful error messages
    if (error.code === 'EADDRINUSE') {
      console.error('💡 Solution: Port', PORT, 'is already in use.');
      console.error('   Try one of these:');
      console.error('   1. Change PORT in your .env file');
      console.error('   2. Stop the other process:', `lsof -ti:${PORT} | xargs kill -9`);
      console.error('   3. Use a different port:', `PORT=5001 npm start`);
    } else if (error.name === 'MongooseServerSelectionError' || error.name === 'MongoNetworkError') {
      console.error('💡 Solution: Cannot connect to MongoDB');
      console.error('   1. Check if MongoDB is running');
      console.error('   2. Verify MONGO_URI in your .env file');
      console.error('   3. Ensure network connectivity to MongoDB');
      console.error('   4. For MongoDB Atlas:');
      console.error('      - Check IP whitelist');
      console.error('      - Verify credentials');
      console.error('      - Ensure cluster is running');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('💡 Solution: Connection refused');
      console.error('   1. Check if the database server is running');
      console.error('   2. Verify connection settings in .env');
      console.error('   3. Check firewall settings');
    }
    
    console.error();
    console.error('For more help, visit: https://docs.8spirits.com/troubleshooting');
    console.error();
    
    process.exit(1);
  }
};

// =============================================================================
// SERVER ERROR HANDLING
// =============================================================================

server.on('error', (error) => {
  console.error();
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('✗ SERVER ERROR');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error();
  
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    console.error('Please change the PORT in your .env file or stop the other process');
  } else if (error.code === 'EACCES') {
    console.error(`Port ${PORT} requires elevated privileges`);
    console.error('Try using a port number above 1024');
  } else {
    console.error('Error:', error.message);
    console.error('Code:', error.code);
  }
  
  console.error();
  process.exit(1);
});

// =============================================================================
// CONNECTION HANDLING
// =============================================================================

// Track active connections
let connections = new Set();

server.on('connection', (connection) => {
  connections.add(connection);
  
  connection.on('close', () => {
    connections.delete(connection);
  });
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

const gracefulShutdown = async (signal) => {
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📴 ${signal} received - Starting graceful shutdown...`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  
  // Step 1: Stop accepting new connections
  console.log('1️⃣  Stopping server from accepting new connections...');
  server.close(async () => {
    console.log('   ✓ Server closed to new connections');
    
    try {
      // Step 2: Close active connections
      console.log('2️⃣  Closing active connections...');
      connections.forEach(connection => connection.destroy());
      console.log(`   ✓ Closed ${connections.size} active connections`);
      
      // Step 3: Close Socket.IO
      console.log('3️⃣  Closing Socket.IO connections...');
      io.close();
      console.log('   ✓ Socket.IO connections closed');
      
      // Step 4: Close Redis connection
      if (redisClient) {
        console.log('4️⃣  Closing Redis connection...');
        await redisClient.quit();
        console.log('   ✓ Redis connection closed');
      }
      
      // Step 5: Close background job queue
      if (emailQueue) {
        console.log('5️⃣  Closing job queue...');
        await emailQueue.close();
        console.log('   ✓ Job queue closed');
      }
      
      // Step 6: Close MongoDB connection
      console.log('6️⃣  Closing MongoDB connection...');
      await mongoose.connection.close();
      console.log('   ✓ MongoDB connection closed');
      
      // Final message
      console.log();
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('✓ GRACEFUL SHUTDOWN COMPLETED');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log();
      console.log('👋 Goodbye! Server stopped cleanly.');
      console.log();
      
      process.exit(0);
    } catch (error) {
      console.error();
      console.error('✗ Error during shutdown:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  });
  
  // Force shutdown after timeout
  const shutdownTimeout = 30000; // 30 seconds
  setTimeout(() => {
    console.error();
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('⚠️  FORCED SHUTDOWN - Timeout exceeded');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error();
    console.error('Some connections did not close gracefully within 30 seconds');
    console.error('Forcing shutdown...');
    console.error();
    process.exit(1);
  }, shutdownTimeout);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================================================
// UNHANDLED ERRORS
// =============================================================================

process.on('unhandledRejection', (reason, promise) => {
  console.error();
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('✗ UNHANDLED PROMISE REJECTION');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error();
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error();
  if (reason?.stack) {
    console.error('Stack:', reason.stack);
  }
  console.error();
  
  // Log to file in production
  if (NODE_ENV === 'production') {
    const errorLog = {
      type: 'unhandledRejection',
      timestamp: new Date().toISOString(),
      reason: reason?.message || reason,
      stack: reason?.stack
    };
    
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.appendFileSync(
      path.join(logsDir, 'errors.log'),
      JSON.stringify(errorLog) + '\n'
    );
  }
  
  // Graceful shutdown
  gracefulShutdown('UNHANDLED_REJECTION');
});

process.on('uncaughtException', (error) => {
  console.error();
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('✗ UNCAUGHT EXCEPTION');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error();
  console.error('Error:', error.message);
  console.error();
  console.error('Stack:', error.stack);
  console.error();
  
  // Log to file in production
  if (NODE_ENV === 'production') {
    const errorLog = {
      type: 'uncaughtException',
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    };
    
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.appendFileSync(
      path.join(logsDir, 'errors.log'),
      JSON.stringify(errorLog) + '\n'
    );
  }
  
  // Exit immediately - uncaught exceptions are serious
  console.error('Application must exit immediately due to uncaught exception');
  console.error();
  process.exit(1);
});

process.on('warning', (warning) => {
  console.warn();
  console.warn('═══════════════════════════════════════════════════════════════');
  console.warn('⚠️  PROCESS WARNING');
  console.warn('═══════════════════════════════════════════════════════════════');
  console.warn();
  console.warn('Name:', warning.name);
  console.warn('Message:', warning.message);
  if (warning.stack) {
    console.warn('Stack:', warning.stack);
  }
  console.warn();
});

// =============================================================================
// MEMORY MONITORING (Development)
// =============================================================================

if (NODE_ENV === 'development') {
  const monitorMemory = () => {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const rssMB = usage.rss / 1024 / 1024;
    
    if (heapUsedMB > 500) {
      console.warn('⚠️  High memory usage detected:');
      console.warn(`   RSS: ${Math.round(rssMB)}MB`);
      console.warn(`   Heap Used: ${Math.round(heapUsedMB)}MB`);
      console.warn(`   Heap Total: ${Math.round(heapTotalMB)}MB`);
      console.warn(`   External: ${Math.round(usage.external / 1024 / 1024)}MB`);
    }
  };
  
  // Check memory every 5 minutes
  setInterval(monitorMemory, 5 * 60 * 1000);
}

// =============================================================================
// EXPORT SERVER (for testing)
// =============================================================================

module.exports = server;

// =============================================================================
// START THE SERVER
// =============================================================================

// Only start if not required as module (for testing)
if (require.main === module) {
  startServer();
}