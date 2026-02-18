const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

class ReportService {
  /**
   * Generate sales report
   */
  static async generateSalesReport(startDate, endDate, format = 'json') {
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      paymentStatus: 'paid'
    }).populate('user', 'firstName lastName email');

    const data = {
      period: { startDate, endDate },
      summary: {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
        averageOrderValue: orders.length > 0 
          ? orders.reduce((sum, o) => sum + o.total, 0) / orders.length 
          : 0,
        totalItems: orders.reduce((sum, o) => sum + o.items.length, 0)
      },
      orders: orders.map(order => ({
        orderNumber: order.orderNumber,
        date: order.createdAt,
        customer: `${order.user?.firstName} ${order.user?.lastName}`,
        email: order.user?.email,
        total: order.total,
        status: order.orderStatus,
        items: order.items.length
      }))
    };

    if (format === 'csv') {
      return this.exportToCSV(data.orders);
    } else if (format === 'pdf') {
      return this.exportToPDF(data);
    } else if (format === 'excel') {
      return this.exportToExcel(data);
    }

    return data;
  }

  /**
   * Generate inventory report
   */
  static async generateInventoryReport(format = 'json') {
    const products = await Product.find({ isActive: true })
      .select('name sku stock lowStockThreshold price costPrice category brand')
      .populate('category', 'name');

    const data = {
      summary: {
        totalProducts: products.length,
        lowStock: products.filter(p => p.stock <= p.lowStockThreshold).length,
        outOfStock: products.filter(p => p.stock === 0).length,
        totalValue: products.reduce((sum, p) => sum + (p.stock * (p.costPrice || p.price)), 0)
      },
      products: products.map(p => ({
        name: p.name,
        sku: p.sku,
        category: p.category?.name,
        brand: p.brand,
        stock: p.stock,
        threshold: p.lowStockThreshold,
        status: p.stock === 0 ? 'Out of Stock' : p.stock <= p.lowStockThreshold ? 'Low Stock' : 'In Stock',
        price: p.price,
        value: p.stock * (p.costPrice || p.price)
      }))
    };

    if (format === 'csv') {
      return this.exportToCSV(data.products);
    } else if (format === 'excel') {
      return this.exportToExcel(data);
    }

    return data;
  }

  /**
   * Generate customer report
   */
  static async generateCustomerReport(format = 'json') {
    const customers = await User.find({ role: 'user' })
      .select('firstName lastName email totalOrders totalSpent loyaltyTier createdAt');

    const data = {
      summary: {
        totalCustomers: customers.length,
        averageLifetimeValue: customers.reduce((sum, c) => sum + c.totalSpent, 0) / customers.length,
        tierDistribution: {
          bronze: customers.filter(c => c.loyaltyTier === 'bronze').length,
          silver: customers.filter(c => c.loyaltyTier === 'silver').length,
          gold: customers.filter(c => c.loyaltyTier === 'gold').length,
          platinum: customers.filter(c => c.loyaltyTier === 'platinum').length
        }
      },
      customers: customers.map(c => ({
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        totalOrders: c.totalOrders,
        totalSpent: c.totalSpent,
        loyaltyTier: c.loyaltyTier,
        joinedDate: c.createdAt
      }))
    };

    if (format === 'csv') {
      return this.exportToCSV(data.customers);
    }

    return data;
  }

  /**
   * Export to CSV
   */
  static exportToCSV(data) {
    try {
      const parser = new Parser();
      const csv = parser.parse(data);
      return csv;
    } catch (error) {
      throw new Error('CSV export failed: ' + error.message);
    }
  }

  /**
   * Export to PDF
   */
  static async exportToPDF(data) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Header
        doc.fontSize(20).text('Sales Report', { align: 'center' });
        doc.moveDown();

        // Summary
        doc.fontSize(14).text('Summary');
        doc.fontSize(10);
        doc.text(`Total Orders: ${data.summary.totalOrders}`);
        doc.text(`Total Revenue: $${data.summary.totalRevenue.toFixed(2)}`);
        doc.text(`Average Order Value: $${data.summary.averageOrderValue.toFixed(2)}`);
        doc.moveDown();

        // Table header
        doc.fontSize(12).text('Orders', { underline: true });
        doc.moveDown(0.5);

        // Orders (simplified for PDF)
        data.orders.slice(0, 20).forEach(order => {
          doc.fontSize(9);
          doc.text(`${order.orderNumber} - ${order.customer} - $${order.total.toFixed(2)}`);
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Export to Excel
   */
  static async exportToExcel(data) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add headers
    if (data.orders) {
      worksheet.columns = [
        { header: 'Order Number', key: 'orderNumber', width: 20 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Customer', key: 'customer', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Total', key: 'total', width: 15 },
        { header: 'Status', key: 'status', width: 15 }
      ];

      // Add rows
      data.orders.forEach(order => {
        worksheet.addRow(order);
      });
    } else if (data.products) {
      worksheet.columns = [
        { header: 'Name', key: 'name', width: 30 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Stock', key: 'stock', width: 10 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Price', key: 'price', width: 12 },
        { header: 'Value', key: 'value', width: 15 }
      ];

      data.products.forEach(product => {
        worksheet.addRow(product);
      });
    }

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    return await workbook.xlsx.writeBuffer();
  }
}

module.exports = ReportService;