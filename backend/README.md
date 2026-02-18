# 8 Spirits Backend

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-4.x-blue?style=for-the-badge&logo=express" alt="Express">
  <img src="https://img.shields.io/badge/MongoDB-6.0-green?style=for-the-badge&logo=mongodb" alt="MongoDB">
  <img src="https://img.shields.io/badge/Type-Enterprise--Level-orange?style=for-the-badge" alt="Enterprise Level">
</p>

<p align="center">
  Ultra-Advanced Enterprise-Level Backend API for 8 Spirits E-commerce Platform with MongoDB
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Scripts](#scripts)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Security](#security)
- [Performance](#performance)
- [Documentation](#documentation)
- [License](#license)

---

## 🚀 Overview

8 Spirits Backend is an ultra-advanced enterprise-level e-commerce backend API designed for a premium spirits and liquor store. Built with Node.js, Express, and MongoDB, it offers comprehensive e-commerce functionality comparable to major platforms like Total Wine.

The backend provides a complete suite of features including user authentication, product management, inventory tracking, order processing, payment integration, subscriptions, loyalty programs, and advanced analytics.

---

## ✨ Features

### Core Commerce
- 🛒 **Product Management** - Advanced product catalog with variants, categories, brands, and attributes
- 📦 **Inventory Management** - Multi-warehouse inventory tracking with real-time sync
- 🛍️ **Shopping Cart** - Persistent cart with pricing rules and discounts
- 💝 **Wishlist** - Save favorite products for later
- 📑 **Order Management** - Complete order lifecycle with tracking
- 💳 **Payment Processing** - Secure payments via Stripe

### Customer Engagement
- 🎁 **Gift Cards** - Purchase, reload, and redeem gift cards
- 🏷️ **Coupons & Discounts** - Flexible promotional codes and discounts
- ⭐ **Reviews & Ratings** - Customer reviews and ratings system
- 👥 **Customer Segmentation** - AI-powered customer segmentation
- 🔔 **Notifications** - Multi-channel notifications (Email, SMS, Push)

### Loyalty & Subscriptions
- 🎯 **Loyalty Program** - Points-based loyalty system with tiers
- 🔄 **Subscriptions** - Recurring order subscriptions
- 📊 **Recommendation Engine** - Personalized product recommendations

### Store Features
- 📍 **Store Locator** - Geospatial store finder with map integration
- 🏪 **Multi-store Management** - Manage multiple retail locations

### Advanced Features
- 🔍 **Advanced Search** - Full-text search with facets and filters
- 📈 **Analytics & Reporting** - Comprehensive dashboards and reports
- 🤖 **Fraud Detection** - AI-powered transaction fraud prevention
- 🧪 **A/B Testing** - Experiment with different strategies
- 💰 **Price Optimization** - Dynamic pricing based on demand

### Technical
- 🔄 **Real-time Updates** - Live updates via WebSockets (Socket.IO)
- ⚡ **Caching** - Redis-powered caching for performance
- 📨 **Background Jobs** - Bull queue for async processing
- ⏰ **Scheduled Tasks** - Cron jobs for automation
- 🔒 **Security** - Enterprise-grade security middleware
- 📝 **API Documentation** - Swagger/OpenAPI documentation

---

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 18+ |
| Framework | Express.js 4.x |
| Database | MongoDB 6.0+ |
| ODM | Mongoose 8.x |
| Authentication | JWT, Passport.js |
| Caching | Redis, ioredis |
| Queue | Bull, Agenda |
| Real-time | Socket.IO |
| Search | Elasticsearch |
| Payments | Stripe, PayPal, Braintree, Square |
| Email | Nodemailer, SendGrid, Mailgun |
| SMS | Twilio |
| File Storage | Cloudinary, AWS S3 |
| Monitoring | Winston, Prometheus, Sentry |
| Testing | Jest, Supertest |

---

## 📦 Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- MongoDB 6.0 or higher
- Redis 6.0 or higher (optional, for caching)
- Elasticsearch 8.x (optional, for advanced search)

---

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd 8-spirits-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB** (if running locally)
   ```bash
   # Using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:6.0
   
   # Or use MongoDB Atlas cloud database
   ```

5. **Start Redis** (optional)
   ```bash
   docker run -d -p 6379:6379 --name redis redis:7-alpine
   ```

6. **Seed the database** (optional)
   ```bash
   npm run seed
   # or for specific data
   npm run seed:products
   npm run seed:users
   ```

7. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

---

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server
NODE_ENV=development
PORT=5000
API_VERSION=v1

# Database
MONGO_URI=mongodb://localhost:27017/8spirits
MONGODB_URI=mongodb://localhost:27017/8spirits

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30

# Authentication
SESSION_SECRET=your-session-secret
COOKIE_SECRET=your-cookie-secret

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Email (SMTP)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
FROM_EMAIL=noreply@8spirits.com

# File Upload
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# AWS (optional)
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# Twilio (SMS)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://8spirits.com
FRONTEND_URL=http://localhost:3000

# Logging
LOG_LEVEL=info
ENABLE_SWAGGER=true
```

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/auth/logout` | User logout |
| POST | `/api/v1/auth/refresh-token` | Refresh access token |
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password |
| GET | `/api/v1/auth/verify-email/:token` | Verify email |
| GET | `/api/v1/auth/google` | Google OAuth login |
| GET | `/api/v1/auth/facebook` | Facebook OAuth login |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/products` | List all products |
| GET | `/api/v1/products/:id` | Get product details |
| POST | `/api/v1/products` | Create product (admin) |
| PUT | `/api/v1/products/:id` | Update product (admin) |
| DELETE | `/api/v1/products/:id` | Delete product (admin) |
| GET | `/api/v1/products/search` | Search products |
| GET | `/api/v1/products/featured` | Get featured products |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List categories |
| GET | `/api/v1/categories/:id` | Get category |
| POST | `/api/v1/categories` | Create category (admin) |
| PUT | `/api/v1/categories/:id` | Update category (admin) |
| DELETE | `/api/v1/categories/:id` | Delete category (admin) |

### Cart
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/cart` | Get user cart |
| POST | `/api/v1/cart` | Add item to cart |
| PUT | `/api/v1/cart` | Update cart item |
| DELETE | `/api/v1/cart/:itemId` | Remove item from cart |
| DELETE | `/api/v1/cart` | Clear cart |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/orders` | List user orders |
| GET | `/api/v1/orders/:id` | Get order details |
| POST | `/api/v1/orders` | Create new order |
| PUT | `/api/v1/orders/:id` | Update order (admin) |
| DELETE | `/api/v1/orders/:id` | Cancel order |
| GET | `/api/v1/orders/:id/tracking` | Track order |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/payments/create-intent` | Create payment intent |
| POST | `/api/v1/payments/webhook` | Stripe webhook |
| GET | `/api/v1/payments/methods` | Get payment methods |
| POST | `/api/v1/payments/methods` | Add payment method |

### Wishlist
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/wishlist` | Get user wishlist |
| POST | `/api/v1/wishlist` | Add to wishlist |
| DELETE | `/api/v1/wishlist/:productId` | Remove from wishlist |

### Reviews
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/reviews/product/:productId` | Get product reviews |
| POST | `/api/v1/reviews` | Create review |
| PUT | `/api/v1/reviews/:id` | Update review |
| DELETE | `/api/v1/reviews/:id` | Delete review |

### Subscriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/subscriptions` | List subscriptions |
| POST | `/api/v1/subscriptions` | Create subscription |
| GET | `/api/v1/subscriptions/:id` | Get subscription |
| PUT | `/api/v1/subscriptions/:id` | Update subscription |
| DELETE | `/api/v1/subscriptions/:id` | Cancel subscription |

### Coupons
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/coupons` | List coupons (admin) |
| POST | `/api/v1/coupons` | Create coupon (admin) |
| POST | `/api/v1/coupons/validate` | Validate coupon |

### Gift Cards
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/giftcards` | List gift cards |
| POST | `/api/v1/giftcards` | Purchase gift card |
| POST | `/api/v1/giftcards/:code/redeem` | Redeem gift card |
| POST | `/api/v1/giftcards/:code/reload` | Reload gift card |

### Loyalty
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/loyalty/profile` | Get loyalty profile |
| GET | `/api/v1/loyalty/points` | Get points balance |
| POST | `/api/v1/loyalty/redeem` | Redeem points |
| GET | `/api/v1/loyalty/history` | Get points history |

### Stores
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/stores` | List stores |
| GET | `/api/v1/stores/:id` | Get store details |
| GET | `/api/v1/stores/nearby` | Find nearby stores |
| POST | `/api/v1/stores` | Create store (admin) |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analytics/dashboard` | Dashboard stats |
| GET | `/api/v1/analytics/sales` | Sales analytics |
| GET | `/api/v1/analytics/products` | Product analytics |
| GET | `/api/v1/analytics/customers` | Customer analytics |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/users` | Manage users |
| GET | `/api/v1/admin/orders` | Manage orders |
| GET | `/api/v1/admin/products` | Manage products |
| GET | `/api/v1/admin/reports` | Generate reports |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inventory` | List inventory |
| PUT | `/api/v1/inventory/:productId` | Update inventory |
| POST | `/api/v1/inventory/transfer` | Transfer stock |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/notifications` | Get notifications |
| PUT | `/api/v1/notifications/:id/read` | Mark as read |
| DELETE | `/api/v1/notifications/:id` | Delete notification |

### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API root info |
| GET | `/health` | Health check |
| GET | `/ready` | Readiness probe |
| GET | `/alive` | Liveness probe |
| GET | `/db-status` | Database status |
| GET | `/api-docs` | Swagger documentation |

---

## 📜 Scripts

```bash
# Development
npm run dev              # Start development server with nodemon

# Production
npm start                # Start production server
npm run pm2:start        # Start with PM2 process manager
npm run pm2:restart      # Restart PM2 process

# Database
npm run seed             # Seed all data
npm run seed:products    # Seed products only
npm run seed:users       # Seed users only
npm run seed:all         # Seed all data
npm run backup:db        # Backup database
npm run restore:db       # Restore database

# Testing
npm test                 # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:unit       # Run unit tests
npm run test:integration # Run integration tests
npm run test:e2e        # Run e2e tests
npm run load:test       # Run load tests with Artillery

# Linting & Formatting
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint errors
npm run format          # Format code with Prettier

# Documentation
npm run generate:docs   # Generate API documentation

# Utilities
npm run migrate         # Run database migrations
npm run migrate:rollback # Rollback last migration
npm run optimize:prices # Run price optimization
npm run segment:customers # Run customer segmentation
npm run sync:inventory  # Sync inventory across warehouses
npm run export:data     # Export data
npm run import:data     # Import data
npm run health:check    # Run health check

# Docker
npm run docker:build    # Build Docker image
npm run docker:run      # Run Docker containers
npm run docker:stop    # Stop Docker containers

# Performance
npm run benchmark       # Run benchmarks
npm run load:test      # Load testing
```

---

## 📂 Project Structure

```
8-spirits-backend/
├── config/                 # Configuration files
│   └── database.js         # MongoDB configuration
├── middleware/             # Express middleware
│   ├── auth.js             # Authentication middleware
│   ├── errorHandler.js     # Error handling
│   ├── requestLogger.js    # Request logging
│   ├── upload.js           # File upload handling
│   └── validator.js        # Input validation
├── models/                 # Mongoose models
│   ├── Analytics.js
│   ├── Coupon.js
│   ├── GiftCard.js
│   ├── Notification.js
│   ├── Order.js
│   ├── Product.js
│   ├── Store.js
│   ├── Subscription.js
│   ├── User.js
│   ├── Wishlist.js
│   └── index.js
├── routes/                 # API routes
│   ├── admin.js
│   ├── analytics.js
│   ├── auth.js
│   ├── cart.js
│   ├── categories.js
│   ├── coupons.js
│   ├── giftcards.js
│   ├── inventory.js
│   ├── loyalty.js
│   ├── notifications.js
│   ├── orders.js
│   ├── payments.js
│   ├── products.js
│   ├── reports.js
│   ├── reviews.js
│   ├── stores.js
│   ├── subscriptions.js
│   ├── upload.js
│   └── wishlist.js
├── services/              # Business logic
│   ├── abTesting.js
│   ├── cacheService.js
│   ├── customerSegmentation.js
│   ├── fraudDetection.js
│   ├── internationalization.js
│   ├── inventorySync.js
│   ├── loyaltyProgram.js
│   ├── messageQueue.js
│   ├── priceOptimization.js
│   ├── recommendationEngine.js
│   ├── reportService.js
│   └── searchService.js
├── scripts/                # Utility scripts
│   ├── seed.js
│   ├── seedProducts.js
│   ├── seedUsers.js
│   └── ...
├── utils/                  # Utility functions
│   ├── cronJobs.js
│   ├── email.js
│   └── payment.js
├── uploads/                # Uploaded files
├── logs/                   # Log files
├── app.js                  # Express app setup
├── server.js               # Server entry point
├── package.json
├── README.md
└── swagger.json            # API documentation
```

---

## 🧪 Testing

The project includes comprehensive test coverage:

```bash
# Run all tests with coverage
npm test

# Run specific test types
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e          # End-to-end tests
npm run test:watch        # Watch mode

# Load testing
npm run load:test         # Using Artillery
```

Test coverage threshold:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

---

## 🔒 Security

The backend implements enterprise-grade security:

- **Authentication**: JWT with refresh tokens, Passport.js OAuth
- **Authorization**: Role-based access control (RBAC)
- **Data Protection**: Input sanitization, XSS protection, NoSQL injection prevention
- **Rate Limiting**: API request limiting, DDoS protection
- **Encryption**: SSL/TLS, encrypted cookies, secure headers (Helmet)
- **CORS**: Configurable cross-origin resource sharing
- **File Upload**: File type validation, size limits, secure storage

---

## ⚡ Performance

Performance optimizations included:

- **Caching**: Redis caching with configurable TTL
- **Compression**: Gzip response compression
- **Database Indexing**: Optimized MongoDB indexes
- **Query Optimization**: Mongoose query caching
- **Background Jobs**: Bull queue for async processing
- **Connection Pooling**: MongoDB and Redis connection pooling
- **CDN Ready**: Static asset optimization
- **Load Balancing**: Ready for horizontal scaling

---

## 📚 Documentation

API documentation is available at:
- **Swagger UI**: `/api-docs` (in development)
- **ReDoc**: `/api-redoc`
- **Postman Collection**: Available in `/docs` folder

---

## 📄 License

PRIVATE - All rights reserved

---

## 👥 Support

For support, please contact:
- Email: support@8spirits.com
- Documentation: https://docs.8spirits.com

---

## 🔗 Related Links

- [Frontend Application](#)
- [Admin Dashboard](#]
- [API Documentation](#)
- [Terms of Service](#)
- [Privacy Policy](#)

---

<p align="center">
  Built with ❤️ by 8 Spirits Team
</p>

