require('dotenv').config();
const { connectDB, mongoose } = require('../config/database');
const User = require('../models/User');
const Product = require('../models/Product');
const { Category } = require('../models/index');

const seedDatabase = async () => {
  try {
    await connectDB();

    console.log('🗑️  Clearing database...');
    await User.deleteMany();
    await Product.deleteMany();
    await Category.deleteMany();

    console.log('👤 Creating admin user...');
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@8spirits.com',
      password: 'admin123',
      role: 'admin',
      isVerified: true
    });

    console.log('📂 Creating categories...');
    const whiskey = await Category.create({ name: 'Whiskey' });
    const vodka = await Category.create({ name: 'Vodka' });
    const wine = await Category.create({ name: 'Wine' });

    console.log('🍾 Creating sample products...');
    await Product.create([
      {
        name: 'Premium Scotch Whiskey',
        description: 'Aged 12 years single malt scotch',
        price: 89.99,
        category: whiskey._id,
        brand: 'Highland Reserve',
        sku: 'WHY-001',
        stock: 50,
        specifications: {
          alcoholContent: 40,
          volume: 750,
          type: 'whiskey',
          country: 'Scotland'
        },
        images: [{ url: 'https://via.placeholder.com/400', isPrimary: true }],
        isFeatured: true
      },
      {
        name: 'Premium Vodka',
        description: 'Ultra smooth triple distilled vodka',
        price: 39.99,
        category: vodka._id,
        brand: 'Crystal Clear',
        sku: 'VOD-001',
        stock: 100,
        specifications: {
          alcoholContent: 40,
          volume: 750,
          type: 'vodka',
          country: 'Russia'
        },
        images: [{ url: 'https://via.placeholder.com/400', isPrimary: true }]
      },
      {
        name: 'French Red Wine',
        description: 'Elegant Bordeaux red wine',
        price: 59.99,
        category: wine._id,
        brand: 'Château Excellence',
        sku: 'WIN-001',
        stock: 75,
        specifications: {
          alcoholContent: 13.5,
          volume: 750,
          vintage: 2018,
          type: 'wine',
          region: 'Bordeaux',
          country: 'France'
        },
        images: [{ url: 'https://via.placeholder.com/400', isPrimary: true }],
        isFeatured: true
      }
    ]);

    console.log('✅ Database seeded successfully!');
    console.log('\n📧 Admin Login:');
    console.log('   Email: admin@8spirits.com');
    console.log('   Password: admin123\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

seedDatabase();