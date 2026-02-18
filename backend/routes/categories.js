const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect, authorize } = require('../middleware/auth');
const { Category } = require('../models/index');
const Product = require('../models/Product');

/**
 * @route   GET /api/categories
 * @desc    Get all categories
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const { includeInactive } = req.query;
    
    const query = includeInactive === 'true' ? {} : { isActive: true };
    
    const categories = await Category.find(query)
      .populate('parent', 'name slug')
      .sort('order name');

    // Get product count for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const productCount = await Product.countDocuments({
          category: category._id,
          isActive: true
        });

        return {
          ...category.toObject(),
          productCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: categoriesWithCount.length,
      data: { categories: categoriesWithCount }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/categories/:id
 * @desc    Get single category
 * @access  Public
 */
router.get('/:id', async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('parent', 'name slug');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Get subcategories
    const subcategories = await Category.find({ parent: category._id });

    // Get product count
    const productCount = await Product.countDocuments({
      category: category._id,
      isActive: true
    });

    res.status(200).json({
      success: true,
      data: {
        category: {
          ...category.toObject(),
          productCount,
          subcategories
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/categories/slug/:slug
 * @desc    Get category by slug
 * @access  Public
 */
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug })
      .populate('parent', 'name slug');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Get subcategories
    const subcategories = await Category.find({ parent: category._id });

    // Get products in this category
    const products = await Product.find({
      category: category._id,
      isActive: true
    })
      .select('name slug price images ratings')
      .limit(12);

    res.status(200).json({
      success: true,
      data: {
        category: {
          ...category.toObject(),
          subcategories,
          products
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/categories
 * @desc    Create category
 * @access  Private/Admin
 */
router.post(
  '/',
  protect,
  authorize('admin'),
  [
    body('name').trim().notEmpty().withMessage('Category name is required'),
    body('description').optional().trim(),
    body('parent').optional().isMongoId().withMessage('Invalid parent category ID'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { name, description, image, parent, order } = req.body;

      // Check if category already exists
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists'
        });
      }

      // If parent provided, verify it exists
      if (parent) {
        const parentCategory = await Category.findById(parent);
        if (!parentCategory) {
          return res.status(404).json({
            success: false,
            message: 'Parent category not found'
          });
        }
      }

      const category = await Category.create({
        name,
        description,
        image,
        parent: parent || null,
        order: order || 0
      });

      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: { category }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/categories/:id
 * @desc    Update category
 * @access  Private/Admin
 */
router.put(
  '/:id',
  protect,
  authorize('admin'),
  [
    body('name').optional().trim().notEmpty(),
    body('parent').optional().isMongoId(),
    validate
  ],
  async (req, res, next) => {
    try {
      let category = await Category.findById(req.params.id);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      // Prevent circular parent reference
      if (req.body.parent && req.body.parent === req.params.id) {
        return res.status(400).json({
          success: false,
          message: 'Category cannot be its own parent'
        });
      }

      category = await Category.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      res.status(200).json({
        success: true,
        message: 'Category updated successfully',
        data: { category }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete category
 * @access  Private/Admin
 */
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has products
    const productCount = await Product.countDocuments({ category: category._id });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category with ${productCount} products. Please reassign products first.`
      });
    }

    // Check if category has subcategories
    const subcategoryCount = await Category.countDocuments({ parent: category._id });
    if (subcategoryCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category with ${subcategoryCount} subcategories. Please delete subcategories first.`
      });
    }

    await category.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/categories/:id/tree
 * @desc    Get category tree (with subcategories)
 * @access  Public
 */
router.get('/:id/tree', async (req, res, next) => {
  try {
    const buildTree = async (categoryId) => {
      const category = await Category.findById(categoryId);
      if (!category) return null;

      const subcategories = await Category.find({ parent: categoryId });
      const subcategoryTrees = await Promise.all(
        subcategories.map(sub => buildTree(sub._id))
      );

      return {
        ...category.toObject(),
        subcategories: subcategoryTrees.filter(Boolean)
      };
    };

    const tree = await buildTree(req.params.id);

    if (!tree) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { category: tree }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;