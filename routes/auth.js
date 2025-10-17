// routes/auth.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth'); // NOTE: singular

const router = express.Router();

/* Helpers */
const ensureJwt = () => {
  if (!process.env.JWT_SECRET) {
    const e = new Error('JWT_SECRET missing'); e.statusCode = 500; throw e;
  }
};
const tokenFor = (id) => {
  ensureJwt();
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });
};
const asyncWrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validate = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { const e = new Error('Validation failed'); e.statusCode = 400; e.details = errors.array(); throw e; }
};

/* Ping to confirm mount */
router.get('/__ping', (req, res) => res.json({ ok: true, route: '/api/auth', ts: new Date().toISOString() }));

/* Validators */
const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name 2–50 chars'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 6 }).withMessage('Password >= 6 chars'),
  body('role').isIn(['client','freelancer']).withMessage('Role must be client or freelancer'),
];
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password required'),
];

/* Register */
router.post('/register', registerValidation, asyncWrap(async (req, res) => {
  validate(req);
  const { name, email, password, role } = req.body;
  const mail = String(email).toLowerCase();
  const exists = await User.findOne({ email: mail });
  if (exists) { const e = new Error('User already exists'); e.statusCode = 400; throw e; }
  const user = await User.create({ name: String(name).trim(), email: mail, password, role });
  const token = tokenFor(user._id);
  user.password = undefined;
  res.status(201).json({ success: true, message: 'User registered', data: { user, token } });
}));

/* Login */
router.post('/login', loginValidation, asyncWrap(async (req, res) => {
  validate(req);
  const { email, password } = req.body;
  const mail = String(email).toLowerCase();
  const user = await User.findOne({ email: mail }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    const e = new Error('Invalid email or password'); e.statusCode = 401; throw e;
  }
  user.lastActive = new Date();
  await user.save({ validateBeforeSave: false });
  const token = tokenFor(user._id);
  user.password = undefined;
  res.json({ success: true, message: 'Login successful', data: { user, token } });
}));

/* Me */
router.get('/me', authenticate, asyncWrap(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; throw e; }
  res.json({ success: true, data: { user } });
}));

/* Logout (stateless JWT) */
router.post('/logout', authenticate, (_req, res) => res.json({ success: true, message: 'Logged out' }));

/* Forgot password (placeholder) */
router.post('/forgot-password', asyncWrap(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase();
  const user = await User.findOne({ email });
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; throw e; }
  res.json({ success: true, message: 'Password reset instructions sent (TODO)' });
}));

module.exports = router;
