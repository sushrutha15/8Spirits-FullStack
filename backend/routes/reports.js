const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ReportService = require('../services/reportService');

/**
 * @route   GET /api/reports/sales
 * @desc    Generate sales report
 * @access  Private/Admin
 */
router.get('/sales', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const report = await ReportService.generateSalesReport(
      new Date(startDate),
      new Date(endDate),
      format
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.csv');
      return res.send(report);
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
      return res.send(report);
    } else if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
      return res.send(report);
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/reports/inventory
 * @desc    Generate inventory report
 * @access  Private/Admin
 */
router.get('/inventory', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;

    const report = await ReportService.generateInventoryReport(format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=inventory-report.csv');
      return res.send(report);
    } else if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=inventory-report.xlsx');
      return res.send(report);
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/reports/customers
 * @desc    Generate customer report
 * @access  Private/Admin
 */
router.get('/customers', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;

    const report = await ReportService.generateCustomerReport(format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=customer-report.csv');
      return res.send(report);
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;