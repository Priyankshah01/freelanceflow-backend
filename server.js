// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();

/* ======================= CORS (Render ↔ Vercel) ======================= */
/**
 * We allow three sources of origins:
 * 1. Local dev (5173 / 3000)
 * 2. Your fixed prod Vercel
 * 3. Anything you pass in .env as ALLOWED_ORIGINS (comma-separated)
 */

const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const ENV_FRONTEND =
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  '';

const ENV_ALLOWED_LIST = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const FIXED_PROD_ORIGINS = [
  'https://freelanceflow-gamma.vercel.app', // your prod Vercel domain
];

// allow any *.vercel.app preview
const VERCEL_PREVIEW_REGEX = /^https:\/\/([a-z0-9-]+\.)?vercel\.app$/i;

// build the final allowlist
const ALLOWED = new Set([
  ...LOCAL_ORIGINS,
  ...FIXED_PROD_ORIGINS,
  ...(ENV_FRONTEND ? [ENV_FRONTEND] : []),
  ...ENV_ALLOWED_LIST,
]);

const corsOrigin = (origin, cb) => {
  if (!origin) return cb(null, true); // curl/Postman/mobile
  if (ALLOWED.has(origin)) return cb(null, true);
  if (VERCEL_PREVIEW_REGEX.test(origin)) return cb(null, true);
  return cb(new Error(`CORS blocked for origin: ${origin}`));
};

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

/* ===== Preflight WITHOUT a path pattern (Express 5 safe) ===== */
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

/* ================= Body parsing & logging ==================== */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    console.log(
      `${new Date().toISOString()} | ${req.method} ${req.path} | Origin: ${req.get('origin') || 'none'}`
    );
    next();
  });
}

/* ===================== Database connect ====================== */
if (!process.env.MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI in environment');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

/* ================= Base & health routes ====================== */
app.get('/', (_req, res) =>
  res.json({
    success: true,
    message: 'FreelanceFlow API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
);

app.get('/api/__health', (_req, res) =>
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  })
);

/* ===================== Route mounting ======================== */
const safeUse = (pathRoute, mod, label) => {
  try {
    app.use(pathRoute, require(mod));
    console.log(`✅ Routes mounted: ${label} at ${pathRoute}`);
  } catch (e) {
    console.log(`⚠️  Skipping ${label} routes (${mod}) - ${e.message}`);
  }
};

safeUse('/api/auth', './routes/auth', 'Auth');
safeUse('/api/users', './routes/users', 'Users');
safeUse('/api/projects', './routes/projects', 'Projects');
safeUse('/api/proposals', './routes/proposals', 'Proposals');
safeUse('/api/admin', './routes/admin', 'Admin');

/* ==================== Serve React & Catch-all ==================== */
/**
 * This is only needed if you ALSO build the frontend inside this repo.
 * On Render (API-only) this folder may not exist — so we guard it.
 */
const CLIENT_BUILD_DIR = path.join(__dirname, 'client', 'dist');

if (fs.existsSync(CLIENT_BUILD_DIR)) {
  app.use(express.static(CLIENT_BUILD_DIR));

  // Express 5 compatible catch-all (exclude /api and /socket.io)
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_BUILD_DIR, 'index.html'));
  });
}

/* ================= Error handling & 404 ====================== */
app.use((error, _req, res, _next) => {
  console.error('Error:', error.message);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    method: req.method,
    availableRoutes: [
      'GET /',
      'GET /api/__health',
      'POST /api/auth/login',
      'POST /api/auth/register',
    ],
  });
});

/* ======================= Socket.IO =========================== */
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  const userId = socket.handshake.query?.userId;
  if (userId) socket.join(`user:${userId}`);
  console.log(`🔌 Socket connected: ${userId || socket.id}`);

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${userId || socket.id}`);
  });
});

/* ====================== Start server ========================= */
server.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
  if (ENV_FRONTEND) console.log(`🌐 FRONTEND_URL/CLIENT_URL allowed: ${ENV_FRONTEND}`);
  if (ENV_ALLOWED_LIST.length) console.log(`🌐 Extra allowed origins: ${ENV_ALLOWED_LIST.join(', ')}`);
});

module.exports = app;
