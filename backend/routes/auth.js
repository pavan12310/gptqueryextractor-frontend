// routes/auth.js — Login, Signup, Google Auth, Profile

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, generateToken } = require('../middleware/auth');

// ─────────────────────────────────────────
// POST /api/auth/signup
// ─────────────────────────────────────────
router.post('/signup', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, password } = req.body;

  try {
    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered. Please login.' });
    }

    // Create user
    const user = await User.create({ name, email, password });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        plan:  user.plan
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Find user and include password
    const user = await User.findOne({ email }).select('+password');

    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Update last login
    user.lastLoginAt = Date.now();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        plan:  user.plan,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────
// POST /api/auth/google
// Google OAuth (token from frontend Google Sign-In)
// ─────────────────────────────────────────
router.post('/google', async (req, res) => {
  const { googleId, email, name, avatar } = req.body;

  if (!googleId || !email) {
    return res.status(400).json({ success: false, message: 'Google auth data missing.' });
  }

  try {
    // Find or create user
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      // Update google info if needed
      user.googleId = googleId;
      user.avatar = avatar || user.avatar;
      user.lastLoginAt = Date.now();
      await user.save({ validateBeforeSave: false });
    } else {
      // New user via Google
      user = await User.create({ name, email, googleId, avatar });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Google login successful!',
      token,
      user: {
        id:     user._id,
        name:   user.name,
        email:  user.email,
        plan:   user.plan,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────
// GET /api/auth/me  (protected)
// Get logged in user profile
// ─────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    success: true,
    user: {
      id:       user._id,
      name:     user.name,
      email:    user.email,
      plan:     user.plan,
      avatar:   user.avatar,
      settings: user.settings,
      stats: {
        totalSessionsRun:     user.totalSessionsRun,
        totalPromptsRun:      user.totalPromptsRun,
        totalQueriesCaptured: user.totalQueriesCaptured,
        totalExports:         user.totalExports
      },
      createdAt:   user.createdAt,
      lastLoginAt: user.lastLoginAt
    }
  });
});

// ─────────────────────────────────────────
// PUT /api/auth/settings  (protected)
// Update user settings
// ─────────────────────────────────────────
router.put('/settings', protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { settings: { ...req.user.settings, ...req.body } },
      { new: true }
    );
    res.json({ success: true, message: 'Settings updated!', settings: user.settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not update settings.' });
  }
});

// ─────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken  = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 min
    await user.save({ validateBeforeSave: false });

    // Send email
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'GPT Query Extractor — Password Reset',
      html: `
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password. This link expires in 30 minutes.</p>
        <a href="${resetUrl}" style="background:#00c27a;color:#000;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold">Reset Password</a>
        <p>If you didn't request this, ignore this email.</p>
      `
    });

    res.json({ success: true, message: 'Password reset email sent!' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Could not send reset email.' });
  }
});

module.exports = router;
