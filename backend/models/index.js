const mongoose = require('mongoose');

// Helper function to safely get or create model
const getModel = (name) => {
  try {
    return mongoose.model(name);
  } catch {
    return null;
  }
};

// Only export models that exist or create minimal ones if they don't
const Category = getModel('Category') || mongoose.model('Category', new mongoose.Schema({
  name: String,
  slug: String,
  description: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true }));

const Order = getModel('Order');
const Review = getModel('Review') || mongoose.model('Review', new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rating: Number,
  comment: String,
  isApproved: { type: Boolean, default: false }
}, { timestamps: true }));

const Cart = getModel('Cart') || mongoose.model('Cart', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 },
    price: Number
  }]
}, { timestamps: true }));

module.exports = {
  Category,
  Order: Order || mongoose.model('Order', new mongoose.Schema({ orderNumber: String, user: mongoose.Schema.Types.ObjectId, total: Number }, { timestamps: true })),
  Review,
  Cart
};
