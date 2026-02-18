const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const Product = require('../models/Product');

/**
 * @route   GET /api/products
 * @desc    Get all products with filtering, sorting, pagination
 * @access  Public
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = '-createdAt',
      category,
      brand,
      minPrice,
      maxPrice,
      search,
      featured,
      inStock
    } = req.query;

    // Build query
    const query = { isActive: true };

    if (category) query.category = category;
    if (brand) query.brand = brand;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (featured === 'true') query.isFeatured = true;
    if (inStock === 'true') query.stock = { $gt: 0 };
    if (search) {
      query.$text = { $search: search };
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .select('-__v');

    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: { products }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/products/:id
 * @desc    Get single product by ID
 * @access  Public
 */
router.get('/:id', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('vendor', 'firstName lastName email')
      .populate({
        path: 'reviews',
        populate: { path: 'user', select: 'firstName lastName avatar' }
      });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment view count
    product.viewCount += 1;
    await product.save();

    res.status(200).json({
      success: true,
      data: { product }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/products
 * @desc    Create new product
 * @access  Private/Admin
 */
router.post(
  '/',
  protect,
  authorize('admin', 'vendor'),
  [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('price').isNumeric().withMessage('Valid price is required'),
    body('category').notEmpty().withMessage('Category is required'),
    body('brand').trim().notEmpty().withMessage('Brand is required'),
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('stock').isNumeric().withMessage('Stock quantity is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      // Set vendor if user is vendor
      if (req.user.role === 'vendor') {
        req.body.vendor = req.user.id;
      }

      const product = await Product.create(req.body);

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: { product }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/products/:id
 * @desc    Update product
 * @access  Private/Admin
 */
router.put(
  '/:id',
  protect,
  authorize('admin', 'vendor'),
  async (req, res, next) => {
    try {
      let product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check ownership for vendors
      if (req.user.role === 'vendor' && product.vendor.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this product'
        });
      }

      product = await Product.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: { product }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete product
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      await product.deleteOne();

      res.status(200).json({
        success: true,
        message: 'Product deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/products/featured/list
 * @desc    Get featured products
 * @access  Public
 */
router.get('/featured/list', async (req, res, next) => {
  try {
    const products = await Product.find({ isFeatured: true, isActive: true })
      .limit(10)
      .sort('-salesCount')
      .select('name slug price images ratings');

    res.status(200).json({
      success: true,
      count: products.length,
      data: { products }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;