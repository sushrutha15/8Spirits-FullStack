const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

/**
 * Create email transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
};

/**
 * Load email template
 */
const loadTemplate = (templateName, data) => {
  try {
    const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateContent);
    return template(data);
  } catch (error) {
    console.error('Error loading email template:', error);
    return null;
  }
};

/**
 * Send email
 */
exports.sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html || options.text,
      text: options.text
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Send welcome email
 */
exports.sendWelcomeEmail = async (user) => {
  try {
    const html = loadTemplate('welcome', {
      name: user.firstName,
      email: user.email
    }) || `
      <h1>Welcome to 8 Spirits!</h1>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for joining 8 Spirits. We're excited to have you!</p>
      <p>Start exploring our premium collection of spirits and wines.</p>
      <p>Cheers!<br>The 8 Spirits Team</p>
    `;

    await this.sendEmail({
      to: user.email,
      subject: 'Welcome to 8 Spirits!',
      html
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

/**
 * Send order confirmation email
 */
exports.sendOrderConfirmationEmail = async (order, user) => {
  try {
    const html = `
      <h1>Order Confirmed!</h1>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for your order. Your order number is: <strong>${order.orderNumber}</strong></p>
      
      <h2>Order Details:</h2>
      <ul>
        ${order.items.map(item => `
          <li>${item.name} - Quantity: ${item.quantity} - $${item.price}</li>
        `).join('')}
      </ul>
      
      <p><strong>Subtotal:</strong> $${order.subtotal.toFixed(2)}</p>
      <p><strong>Tax:</strong> $${order.tax.toFixed(2)}</p>
      <p><strong>Shipping:</strong> $${order.shippingCost.toFixed(2)}</p>
      <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
      
      <p>We'll send you another email when your order ships.</p>
      
      <p>Cheers!<br>The 8 Spirits Team</p>
    `;

    await this.sendEmail({
      to: user.email,
      subject: `Order Confirmation - ${order.orderNumber}`,
      html
    });
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
  }
};

/**
 * Send password reset email
 */
exports.sendPasswordResetEmail = async (user, resetToken) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const html = `
      <h1>Password Reset Request</h1>
      <p>Hi ${user.firstName},</p>
      <p>You requested a password reset for your 8 Spirits account.</p>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
      <p>This link will expire in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <p>Cheers!<br>The 8 Spirits Team</p>
    `;

    await this.sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};

/**
 * Send order shipped email
 */
exports.sendOrderShippedEmail = async (order, user) => {
  try {
    const html = `
      <h1>Your Order Has Shipped!</h1>
      <p>Hi ${user.firstName},</p>
      <p>Great news! Your order <strong>${order.orderNumber}</strong> has been shipped.</p>
      ${order.trackingNumber ? `<p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>` : ''}
      <p>You should receive it within 3-5 business days.</p>
      <p>Cheers!<br>The 8 Spirits Team</p>
    `;

    await this.sendEmail({
      to: user.email,
      subject: `Your Order Has Shipped - ${order.orderNumber}`,
      html
    });
  } catch (error) {
    console.error('Error sending order shipped email:', error);
  }
};