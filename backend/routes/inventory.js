const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const Product = require('../models/Product');

/**
 * @route   GET /api/inventory
 * @desc    Get inventory overview
 * @access  Private/Admin/Warehouse
 */
router.get('/', protect, authorize('admin', 'warehouse'), async (req, res, next) => {
  try {
    const { warehouse, status } = req.query;

    let query = { isActive: true };

    // Filter by warehouse
    if (warehouse) {
      query['warehouseLocations.warehouse'] = warehouse;
    }

    // Filter by status
    if (status === 'low') {
      query.stock = { $gt: 0, $lte: '$lowStockThreshold' };
    } else if (status === 'out') {
      query.stock = 0;
    }

    const products = await Product.find(query)
      .select('name sku stock lowStockThreshold warehouseLocations price costPrice')
      .sort('stock name');

    const summary = {
      totalItems: await Product.countDocuments({ isActive: true }),
      lowStock: await Product.countDocuments({
        isActive: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] }
      }),
      outOfStock: await Product.countDocuments({ isActive: true, stock: 0 }),
      totalValue: await Product.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            value: { $sum: { $multiply: ['$stock', { $ifNull: ['$costPrice', '$price'] }] } }
          }
        }
      ])
    };

    res.status(200).json({
      success: true,
      data: {
        summary: {
          ...summary,
          totalValue: summary.totalValue[0]?.value || 0
        },
        products
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/inventory/:id/adjust
 * @desc    Adjust inventory stock
 * @access  Private/Admin/Warehouse
 */
router.put(
  '/:id/adjust',
  protect,
  authorize('admin', 'warehouse'),
  [
    body('adjustment').isInt().withMessage('Adjustment must be an integer'),
    body('reason').notEmpty().withMessage('Reason is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { adjustment, reason, warehouse } = req.body;

      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Adjust stock
      if (warehouse) {
        const warehouseLoc = product.warehouseLocations.find(
          w => w.warehouse === warehouse
        );
        if (warehouseLoc) {
          warehouseLoc.quantity += adjustment;
        }
      } else {
        product.stock += adjustment;
      }

      // Ensure stock doesn't go negative
      if (product.stock < 0) {
        product.stock = 0;
      }

      await product.save();

      // Log adjustment (implement inventory log model if needed)
      console.log(`Inventory adjusted: ${product.name} by ${adjustment} (${reason})`);

      res.status(200).json({
        success: true,
        message: 'Inventory adjusted successfully',
        data: {
          product: {
            id: product._id,
            name: product.name,
            sku: product.sku,
            stock: product.stock
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/inventory/transfer
 * @desc    Transfer inventory between warehouses
 * @access  Private/Admin/Warehouse
 */
router.post(
  '/transfer',
  protect,
  authorize('admin', 'warehouse'),
  [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('fromWarehouse').notEmpty().withMessage('Source warehouse is required'),
    body('toWarehouse').notEmpty().withMessage('Destination warehouse is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { productId, fromWarehouse, toWarehouse, quantity, notes } = req.body;

      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Find warehouses
      const from = product.warehouseLocations.find(w => w.warehouse === fromWarehouse);
      const to = product.warehouseLocations.find(w => w.warehouse === toWarehouse);

      if (!from) {
        return res.status(404).json({
          success: false,
          message: 'Source warehouse not found'
        });
      }

      if (from.quantity < quantity) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock in source warehouse'
        });
      }

      // Transfer
      from.quantity -= quantity;

      if (to) {
        to.quantity += quantity;
      } else {
        product.warehouseLocations.push({
          warehouse: toWarehouse,
          quantity,
          reserved: 0
        });
      }

      await product.save();

      res.status(200).json({
        success: true,
        message: 'Inventory transferred successfully',
        data: {
          product: {
            id: product._id,
            name: product.name,
            warehouseLocations: product.warehouseLocations
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/inventory/low-stock-alerts
 * @desc    Get low stock alerts
 * @access  Private/Admin/Warehouse
 */
router.get('/low-stock-alerts', protect, authorize('admin', 'warehouse'), async (req, res, next) => {
  try {
    const lowStockProducts = await Product.find({
      isActive: true,
      $expr: { $lte: ['$stock', '$lowStockThreshold'] }
    })
      .select('name sku stock lowStockThreshold price salesCount')
      .sort('stock');

    res.status(200).json({
      success: true,
      count: lowStockProducts.length,
      data: { products: lowStockProducts }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/inventory/bulk-import
 * @desc    Bulk import inventory
 * @access  Private/Admin
 */
router.post(
  '/bulk-import',
  protect,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { items } = req.body; // Array of { sku, stock, warehouse }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Items array is required'
        });
      }

      const results = {
        updated: 0,
        failed: 0,
        errors: []
      };

      for (const item of items) {
        try {
          const product = await Product.findOne({ sku: item.sku });

          if (!product) {
            results.failed++;
            results.errors.push({ sku: item.sku, error: 'Product not found' });
            continue;
          }

          if (item.warehouse) {
            const warehouse = product.warehouseLocations.find(
              w => w.warehouse === item.warehouse
            );
            if (warehouse) {
              warehouse.quantity = item.stock;
            } else {
              product.warehouseLocations.push({
                warehouse: item.warehouse,
                quantity: item.stock,
                reserved: 0
              });
            }
          } else {
            product.stock = item.stock;
          }

          await product.save();
          results.updated++;
        } catch (error) {
          results.failed++;
          results.errors.push({ sku: item.sku, error: error.message });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Bulk import completed',
        data: results
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;