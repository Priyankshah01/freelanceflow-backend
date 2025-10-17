const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });

// Validation rules
const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name 2-50 chars'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  body('role').isIn(['client', 'freelancer']).withMessage('Role must be client or freelancer')
];
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password required')
];

// Register
router.post('/register', registerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });

  const { name, email, password, role } = req.body;
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) return res.status(400).json({ success: false, message: 'User already exists' });

  const user = await User.create({ name: name.trim(), email: email.toLowerCase(), password, role });
  const token = generateToken(user._id);
  user.password = undefined;

  res.status(201).json({ success: true, message: 'User registered', data: { user, token } });
});

// Login
router.post('/login', loginValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });

  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) return res.status(401).json({ success: false, message: 'Invalid email or password' });

  user.lastActive = new Date();
  await user.save({ validateBeforeSave: false });
  const token = generateToken(user._id);
  user.password = undefined;

  res.status(200).json({ success: true, message: 'Login successful', data: { user, token } });
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.status(200).json({ success: true, data: { user } });
});

// Logout
router.post('/logout', authenticate, (_req, res) => res.status(200).json({ success: true, message: 'Logged out successfully' }));

// Forgot password placeholder
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.status(200).json({ success: true, message: 'Password reset instructions sent (TODO)' });
});

module.exports = router;
