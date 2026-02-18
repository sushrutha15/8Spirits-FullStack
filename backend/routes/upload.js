const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadSingle, uploadMultiple } = require('../middleware/upload');

/**
 * @route   POST /api/upload/image
 * @desc    Upload single image
 * @access  Private
 */
router.post('/image', protect, uploadSingle('image', 'images'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const fileUrl = `/uploads/images/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        filename: req.file.filename,
        url: fileUrl,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/upload/images
 * @desc    Upload multiple images
 * @access  Private
 */
router.post('/images', protect, uploadMultiple('images', 5, 'images'), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const files = req.files.map(file => ({
      filename: file.filename,
      url: `/uploads/images/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype
    }));

    res.status(200).json({
      success: true,
      message: `${files.length} images uploaded successfully`,
      data: { files }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/upload/avatar
 * @desc    Upload user avatar
 * @access  Private
 */
router.post('/avatar', protect, uploadSingle('avatar', 'avatars'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const User = require('../models/User');
    const fileUrl = `/uploads/avatars/${req.file.filename}`;

    // Update user avatar
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: fileUrl },
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: fileUrl,
        user
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;