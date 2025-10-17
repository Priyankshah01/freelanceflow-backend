// routes/auth.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth'); // <- note: middleware (no "s")

const router = express.Router();

/* ------------------------ Helpers ------------------------ */
const ensureJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    const err = new Error('Server misconfiguration: JWT_SECRET is missing');
    err.statusCode = 500;
    throw err;
  }
};

// consistent token generator
const generateToken = (userId) => {
  ensureJwtSecret();
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// common validation error responder
const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed');
    err.statusCode = 400;
    err.details = errors.array();
    throw err;
  }
};

// async wrapper to forward errors to the global error handler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------------ Validators ------------------------ */
const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 chars'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 chars'),
  body('role').isIn(['client', 'freelancer']).withMessage('Role must be client or freelancer'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

/* ------------------------ Debug/Ping ------------------------ */
/** Quick check to confirm the router is mounted in prod */
router.get('/__ping', (req, res) => {
  res.json({
    ok: true,
    route: '/api/auth',
    ts: new Date().toISOString(),
  });
});

/* ------------------------ Auth Routes ------------------------ */
// POST /api/auth/register
router.post(
  '/register',
  registerValidation,
  asyncHandler(async (req, res) => {
    handleValidation(req);

    const { name, email, password, role } = req.body;
    const normalizedEmail = String(email).toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      const err = new Error('User already exists');
      err.statusCode = 400;
      throw err;
    }

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password, // assume User model hashes on save (pre 'save' hook)
      role,
    });

    const token = generateToken(user._id);

    // never send password
    user.password = undefined;

    res.status(201).json({
      success: true,
      message: 'User registered',
      data: { user, token },
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  loginValidation,
  asyncHandler(async (req, res) => {
    handleValidation(req);

    const { email, password } = req.body;
    const normalizedEmail = String(email).toLowerCase();

    // +password to include the hashed field for comparison
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      throw err;
    }

    user.lastActive = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);
    user.password = undefined;

    res.json({
      success: true,
      message: 'Login successful',
      data: { user, token },
    });
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    res.json({ success: true, data: { user } });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  authenticate,
  (req, res) => {
    // If you’re using JWT in headers, there’s nothing to invalidate server-side.
    // If you later use httpOnly cookies, you can clear them here.
    res.json({ success: true, message: 'Logged out successfully' });
  }
);

// POST /api/auth/forgot-password (placeholder)
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').toLowerCase();
    const user = await User.findOne({ email });
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    // TODO: implement token generation + email
    res.json({ success: true, message: 'Password reset instructions sent (TODO)' });
  })
);
router.post('/api/auth/login', loginValidation, asyncHandler(async (req, res) => {
  handleValidation(req);

  const { email, password } = req.body;
  const normalizedEmail = String(email).toLowerCase();

  // +password to include the hashed field for comparison
  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  user.lastActive = new Date();
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id);
  user.password = undefined;

  res.json({
    success: true,
    message: 'Login successful',
    data: { user, token },
  });
}));
module.exports = router;
