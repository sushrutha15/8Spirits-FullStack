/**
 * 8 Spirits E-commerce Backend API
 * Advanced Enterprise-Level Application with MongoDB
 * Total Wine Level Features
 * 
 * Features:
 * - JWT Authentication & Authorization with Refresh Tokens
 * - Advanced Role-based Access Control
 * - Rate Limiting & DDoS Protection
 * - Request Logging & Monitoring
 * - Advanced Error Handling & Validation
 * - File Upload Support with Multiple Storage Options
 * - API Versioning
 * - Comprehensive Health Checks
 * - Graceful Shutdown
 * - Security Best Practices (Helmet, XSS, NoSQL Injection)
 * - CORS Configuration
 * - Response Compression
 * - Request Sanitization
 * - Session Management
 * - Cookie Parser
 * - Advanced Product Management with Variants
 * - Inventory Management (Multi-warehouse)
 * - Order Management with Tracking
 * - Subscription System
 * - Coupon & Discount System
 * - Gift Card System
 * - Loyalty Program
 * - Wishlist Management
 * - Review & Rating System
 * - Store Locator with Geospatial Queries
 * - Analytics & Reporting
 * - Recommendation Engine
 * - Advanced Search with Facets
 * - Notification System
 * - Email & SMS Integration
 * - Payment Processing (Stripe)
 * - Real-time Updates (Socket.IO)
 * - Caching (Redis)
 * - Background Jobs (Bull Queue)
 * - Automated Tasks (Cron)
 * - API Documentation (Swagger)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Middleware imports
const errorHandler = require('./middleware/errorHandler');
const { protect, authorize } = require('./middleware/auth');
const requestLogger = require('./middleware/requestLogger');

// Initialize Express app
const app = express();

// Trust proxy - for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Set security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Enable CORS with specific origins
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'https://8spirits.com',
      'https://www.8spirits.com',
      'https://admin.8spirits.com'
    ].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page']
};

app.use(cors(corsOptions));

// Data sanitization against NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized NoSQL injection attempt: ${key}`);
  }
}));

// Data sanitization against XSS
app.use(xss());

// Prevent HTTP Parameter Pollution
app.use(hpp({
  whitelist: [
    'price',
    'rating',
    'category',
    'brand',
    'sort',
    'page',
    'limit',
    'minPrice',
    'maxPrice',
    'type',
    'status',
    'search'
  ]
}));

// Compress responses
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6
}));

// =============================================================================
// PARSERS & COOKIES
// =============================================================================

// Cookie parser
app.use(cookieParser(process.env.COOKIE_SECRET || 'cookie-secret'));

// Body parser - Raw body for webhooks (before express.json)
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }));

// Body parser
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

if (process.env.MONGO_URI) {
  app.use(session({
    secret: process.env.SESSION_SECRET || 'session-secret-change-this',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      touchAfter: 24 * 3600 // Lazy session update
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  }));
}

// =============================================================================
// LOGGING MIDDLEWARE
// =============================================================================

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Morgan logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Create a write stream for access logs
  const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
  );
  app.use(morgan('combined', { stream: accessLogStream }));
}

// Custom request logger
app.use(requestLogger);

// =============================================================================
// RATE LIMITING
// =============================================================================

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const trustedIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    return trustedIPs.includes(req.ip);
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  handler: (req, res) => {
    console.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts. Please try again in 15 minutes.'
    });
  }
});

// Payment endpoint rate limiter
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Too many payment requests, please try again later.'
  }
});

// Apply rate limiting
app.use('/api', apiLimiter);
app.use('/api/v1', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/payments', paymentLimiter);
app.use('/api/v1/payments', paymentLimiter);

// =============================================================================
// STATIC FILES
// =============================================================================

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Serve API documentation
if (process.env.NODE_ENV === 'development' || process.env.ENABLE_SWAGGER === 'true') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerDocument = require('./swagger.json');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// =============================================================================
// API INFORMATION & DOCUMENTATION
// =============================================================================

// API Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to 8 Spirits API - Premium Spirits E-commerce Platform',
    version: '2.0.0',
    database: 'MongoDB',
    documentation: '/api-docs',
    health: '/health',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      products: '/api/products',
      categories: '/api/categories',
      cart: '/api/cart',
      orders: '/api/orders',
      payments: '/api/payments',
      reviews: '/api/reviews',
      wishlist: '/api/wishlist',
      subscriptions: '/api/subscriptions',
      coupons: '/api/coupons',
      giftcards: '/api/giftcards',
      stores: '/api/stores',
      notifications: '/api/notifications',
      analytics: '/api/analytics',
      admin: '/api/admin',
      inventory: '/api/inventory',
      reports: '/api/reports'
    },
    features: [
      'User Authentication & Authorization',
      'Advanced Product Management with Variants',
      'Multi-warehouse Inventory System',
      'Shopping Cart & Wishlist',
      'Order Processing & Tracking',
      'Payment Integration (Stripe)',
      'Subscription Management',
      'Coupon & Discount System',
      'Gift Card System',
      'Loyalty Program',
      'Review & Rating System',
      'Store Locator',
      'Advanced Search & Filters',
      'Recommendation Engine',
      'Analytics & Reporting',
      'Notification System',
      'Admin Dashboard',
      'Real-time Updates',
      'Background Jobs',
      'Automated Tasks'
    ],
    status: 'operational',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Documentation
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'API Documentation',
    swagger: '/api-docs',
    postman: 'https://documenter.getpostman.com/8spirits',
    documentation: 'https://docs.8spirits.com',
    support: 'support@8spirits.com',
    version: '2.0.0',
    endpoints: {
      versioned: '/api/v1',
      legacy: '/api'
    }
  });
});

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

const { mongoose, getDatabaseStats } = require('./config/database');

// Comprehensive health check
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '2.0.0',
      database: {
        connected: mongoose.connection.readyState === 1,
        name: mongoose.connection.name,
        host: mongoose.connection.host,
        state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState]
      },
      memory: {
        usage: process.memoryUsage(),
        free: require('os').freemem(),
        total: require('os').totalmem(),
        percentUsed: ((1 - require('os').freemem() / require('os').totalmem()) * 100).toFixed(2) + '%'
      },
      cpu: {
        usage: process.cpuUsage(),
        cores: require('os').cpus().length
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        hostname: require('os').hostname()
      }
    };

    res.status(200).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Readiness probe (for Kubernetes/Docker)
app.get('/ready', async (req, res) => {
  try {
    const isConnected = mongoose.connection.readyState === 1;
    if (isConnected) {
      res.status(200).json({ 
        ready: true,
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({ 
        ready: false, 
        database: 'not connected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({ 
      ready: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Liveness probe (for Kubernetes/Docker)
app.get('/alive', (req, res) => {
  res.status(200).json({ 
    alive: true,
    timestamp: new Date().toISOString()
  });
});

// Database status
app.get('/db-status', async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =============================================================================
// API ROUTES - VERSION 1
// =============================================================================

const API_V1 = '/api/v1';

// Import all routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const reviewRoutes = require('./routes/reviews');
const categoryRoutes = require('./routes/categories');
const paymentRoutes = require('./routes/payments');
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/admin');
const inventoryRoutes = require('./routes/inventory');
const reportRoutes = require('./routes/reports');
const wishlistRoutes = require('./routes/wishlist');
const notificationRoutes = require('./routes/notifications');
const giftcardRoutes = require('./routes/giftcards');
const couponRoutes = require('./routes/coupons');
const subscriptionRoutes = require('./routes/subscriptions');
const storeRoutes = require('./routes/stores');
const analyticsRoutes = require('./routes/analytics');
const loyaltyRoutes = require('./routes/loyalty');

// Mount versioned routes
app.use(`${API_V1}/auth`, authRoutes);
app.use(`${API_V1}/products`, productRoutes);
app.use(`${API_V1}/cart`, cartRoutes);
app.use(`${API_V1}/orders`, orderRoutes);
app.use(`${API_V1}/reviews`, reviewRoutes);
app.use(`${API_V1}/categories`, categoryRoutes);
app.use(`${API_V1}/payments`, paymentRoutes);
app.use(`${API_V1}/upload`, uploadRoutes);
app.use(`${API_V1}/admin`, adminRoutes);
app.use(`${API_V1}/inventory`, inventoryRoutes);
app.use(`${API_V1}/reports`, reportRoutes);
app.use(`${API_V1}/wishlist`, wishlistRoutes);
app.use(`${API_V1}/notifications`, notificationRoutes);
app.use(`${API_V1}/giftcards`, giftcardRoutes);
app.use(`${API_V1}/coupons`, couponRoutes);
app.use(`${API_V1}/subscriptions`, subscriptionRoutes);
app.use(`${API_V1}/stores`, storeRoutes);
app.use(`${API_V1}/analytics`, analyticsRoutes);
app.use(`${API_V1}/loyalty`, loyaltyRoutes);

// =============================================================================
// LEGACY API ROUTES (for backward compatibility)
// =============================================================================

// Mount legacy routes (non-versioned)
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/giftcards', giftcardRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/loyalty', loyaltyRoutes);

// =============================================================================
// API STATISTICS & METRICS
// =============================================================================

let requestCount = 0;
let errorCount = 0;
let successCount = 0;
const startTime = Date.now();

// Request counter middleware
app.use((req, res, next) => {
  requestCount++;
  
  // Track response
  const originalSend = res.send;
  res.send = function (data) {
    if (res.statusCode >= 400) {
      errorCount++;
    } else {
      successCount++;
    }
    originalSend.call(this, data);
  };
  
  next();
});

// Metrics endpoint (protected)
app.get('/api/metrics', protect, authorize('admin'), async (req, res) => {
  try {
    const dbStats = await getDatabaseStats();
    const uptime = process.uptime();
    
    res.status(200).json({
      success: true,
      data: {
        requests: {
          total: requestCount,
          success: successCount,
          errors: errorCount,
          errorRate: ((errorCount / requestCount) * 100).toFixed(2) + '%'
        },
        uptime: {
          seconds: uptime,
          formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
        },
        memory: process.memoryUsage(),
        database: dbStats,
        timestamp: new Date().toISOString(),
        startTime: new Date(startTime).toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Reset metrics (admin only)
app.post('/api/metrics/reset', protect, authorize('admin'), (req, res) => {
  requestCount = 0;
  errorCount = 0;
  successCount = 0;
  
  res.status(200).json({
    success: true,
    message: 'Metrics reset successfully'
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler - Route not found
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    suggestion: 'Please check the API documentation at /api/docs',
    availableRoutes: {
      auth: '/api/auth',
      products: '/api/products',
      categories: '/api/categories',
      cart: '/api/cart',
      orders: '/api/orders',
      reviews: '/api/reviews',
      documentation: '/api-docs'
    },
    timestamp: new Date().toISOString()
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// =============================================================================
// PROCESS ERROR HANDLERS
// =============================================================================

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('✗ UNHANDLED REJECTION! 💥');
  console.error('Error:', err.name, '-', err.message);
  console.error('Stack:', err.stack);
  
  // Log to file in production
  if (process.env.NODE_ENV === 'production') {
    const errorLog = {
      type: 'unhandledRejection',
      timestamp: new Date().toISOString(),
      error: err.message,
      stack: err.stack
    };
    
    fs.appendFileSync(
      path.join(logsDir, 'errors.log'),
      JSON.stringify(errorLog) + '\n'
    );
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('✗ UNCAUGHT EXCEPTION! 💥');
  console.error('Error:', err.name, '-', err.message);
  console.error('Stack:', err.stack);
  
  // Log to file
  if (process.env.NODE_ENV === 'production') {
    const errorLog = {
      type: 'uncaughtException',
      timestamp: new Date().toISOString(),
      error: err.message,
      stack: err.stack
    };
    
    fs.appendFileSync(
      path.join(logsDir, 'errors.log'),
      JSON.stringify(errorLog) + '\n'
    );
  }
  
  // Exit process
  console.error('Application must exit due to uncaught exception');
  process.exit(1);
});

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = app;