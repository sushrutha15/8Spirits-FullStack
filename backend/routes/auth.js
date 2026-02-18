const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { firstName, lastName, email, password } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');

      const user = await User.create({
        firstName,
        lastName,
        email,
        password,
        verificationToken,
        isVerified: false
      });

      const token = user.generateAuthToken();

      // Send verification email (would be handled by email service in production)
      // For now, we'll include the token in the response for testing
      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please verify your email.',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified
          },
          token,
          verificationUrl // Remove in production
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email }).select('+password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      user.lastLogin = Date.now();
      await user.save();

      const token = user.generateAuthToken();
      const refreshToken = user.generateRefreshToken();

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            avatar: user.avatar
          },
          token,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh-token',
  [
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);

      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      const newToken = user.generateAuthToken();
      const newRefreshToken = user.generateRefreshToken();

      res.status(200).json({
        success: true,
        data: {
          token: newToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }
  }
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', protect, async (req, res, next) => {
  try {
    // In a production app, you might want to blacklist the token
    // For now, we'll just return success
    // The client should remove the token from storage

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  '/forgot-password',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });

      if (!user) {
        // Don't reveal if user exists
        return res.status(200).json({
          success: true,
          message: 'If an account exists with this email, you will receive a password reset link.'
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = Date.now() + 3600000; // 1 hour

      user.resetPasswordToken = resetToken;
      user.resetPasswordExpiry = resetTokenExpiry;
      await user.save();

      // In production, send email with reset link
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

      res.status(200).json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.',
        resetUrl // Remove in production
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password
 * @access  Public
 */
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { token, password } = req.body;

      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpiry: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }

      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpiry = undefined;
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Password reset successful'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address
 * @access  Public
 */
router.post(
  '/verify-email',
  [
    body('token').notEmpty().withMessage('Verification token is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { token } = req.body;

      const user = await User.findOne({
        verificationToken: token
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification token'
        });
      }

      user.isVerified = true;
      user.verificationToken = undefined;
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend verification email
 * @access  Public
 */
router.post(
  '/resend-verification',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });

      if (!user) {
        return res.status(200).json({
          success: true,
          message: 'If an account exists and is not verified, you will receive a new verification email.'
        });
      }

      if (user.isVerified) {
        return res.status(400).json({
          success: false,
          message: 'This email is already verified'
        });
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.verificationToken = verificationToken;
      await user.save();

      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

      res.status(200).json({
        success: true,
        message: 'Verification email sent',
        verificationUrl // Remove in production
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          isVerified: user.isVerified,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/auth/update-profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/update-profile',
  protect,
  [
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('phone').optional().matches(/^\+?[\d\s-()]+$/),
    validate
  ],
  async (req, res, next) => {
    try {
      const { firstName, lastName, phone, dateOfBirth } = req.body;

      const user = await User.findById(req.user.id);

      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (phone) user.phone = phone;
      if (dateOfBirth) user.dateOfBirth = dateOfBirth;

      await user.save();

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            dateOfBirth: user.dateOfBirth
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user.id).select('+password');

      const isPasswordValid = await user.comparePassword(currentPassword);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      user.password = newPassword;
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/auth/google
 * @desc    Authenticate with Google
 * @access  Public
 */
router.post(
  '/google',
  [
    body('idToken').notEmpty().withMessage('Google ID token is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { idToken } = req.body;

      // In production, verify the Google ID token
      // For now, we'll create/find user based on a mock
      
      // Mock: In production, use Google OAuth verify
      // const { OAuth2Client } = require('google-auth-library');
      // const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      // const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
      // const payload = ticket.getPayload();

      // For demo purposes, extract email from token (not secure - remove in production)
      const base64Url = idToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString());

      const { email, name, picture } = payload;

      // Find or create user
      let user = await User.findOne({ email });

      if (!user) {
        const names = name ? name.split(' ') : ['Google', 'User'];
        user = await User.create({
          firstName: names[0] || 'Google',
          lastName: names.slice(1).join(' ') || 'User',
          email,
          avatar: picture,
          isVerified: true,
          authProvider: 'google'
        });
      }

      const token = user.generateAuthToken();
      const refreshToken = user.generateRefreshToken();

      res.status(200).json({
        success: true,
        message: 'Google login successful',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
            isVerified: user.isVerified
          },
          token,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/auth/facebook
 * @desc    Authenticate with Facebook
 * @access  Public
 */
router.post(
  '/facebook',
  [
    body('accessToken').notEmpty().withMessage('Facebook access token is required'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { accessToken } = req.body;

      // In production, verify the Facebook access token
      // const response = await axios.get(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`);
      // const { id, name, email, picture } = response.data;

      // For demo, we'll assume the token is valid and extract info from body
      const { facebookId, name, email, picture } = req.body;

      // Find or create user
      let user = await User.findOne({ email });

      if (!user) {
        const names = name ? name.split(' ') : ['Facebook', 'User'];
        user = await User.create({
          firstName: names[0] || 'Facebook',
          lastName: names.slice(1).join(' ') || 'User',
          email: email || `${facebookId}@facebook.com`,
          avatar: picture?.data?.url,
          isVerified: true,
          authProvider: 'facebook'
        });
      }

      const token = user.generateAuthToken();
      const refreshToken = user.generateRefreshToken();

      res.status(200).json({
        success: true,
        message: 'Facebook login successful',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
            isVerified: user.isVerified
          },
          token,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
