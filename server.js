// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();

/* =================================================================== */
/* CORS (Render backend ↔ Vercel frontend, incl. preview deployments)   */
/* =================================================================== */
const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Accept either env name; prefer FRONTEND_URL in prod
const ENV_FRONTEND =
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  ''; // e.g., https://freelanceflow-gamma.vercel.app

// Allow all *.vercel.app preview URLs (project previews)
const VERCEL_PREVIEW_REGEX = /^https:\/\/([a-z0-9-]+\.)?vercel\.app$/i;

// You can hard-allow your main Vercel domain here for clarity:
const FIXED_PROD_ORIGINS = [
  'https://freelanceflow-gamma.vercel.app',
];

const ALLOWED = new Set([
  ...LOCAL_ORIGINS,
  ...FIXED_PROD_ORIGINS,
  ...(ENV_FRONTEND ? [ENV_FRONTEND] : []),
]);

const corsOrigin = (origin, cb) => {
  if (!origin) return cb(null, true); // non-browser tools (curl, Postman)
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
// Respond to all preflight requests explicitly
app.options('*', cors(corsOptions));

/* =================================================================== */
/* Body parsing & simple request logging                                */
/* =================================================================== */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    console.log(
      `${new Date().toISOString()} | ${req.method} ${req.path} | Origin: ${
        req.get('origin') || 'none'
      }`
    );
    next();
  });
}

/* =================================================================== */
/* Database connection                                                  */
/* =================================================================== */
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

/* =================================================================== */
/* Base & health routes                                                 */
/* =================================================================== */
app.get('/', (_req, res) =>
  res.json({
    success: true,
    message: 'FreelanceFlow API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
);

// Standard health path
app.get('/api/__health', (_req, res) =>
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  })
);

/* =================================================================== */
/* Route mounting                                                       */
/* =================================================================== */
const safeUse = (path, mod, label) => {
  try {
    app.use(path, require(mod));
    console.log(`✅ Routes mounted: ${label} at ${path}`);
  } catch (e) {
    console.log(`⚠️  Skipping ${label} routes (${mod})`);
  }
};

safeUse('/api/auth', './routes/auth', 'Auth');
// Add others as they exist in your project:
safeUse('/api/users', './routes/users', 'Users');
safeUse('/api/projects', './routes/projects', 'Projects');
safeUse('/api/proposals', './routes/proposals', 'Proposals');
safeUse('/api/admin', './routes/admin', 'Admin');

/* =================================================================== */
/* Error handling & 404                                                 */
/* =================================================================== */
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
    availableRoutes: ['GET /', 'GET /api/__health', 'POST /api/auth/login', 'POST /api/auth/register'],
  });
});

/* =================================================================== */
/* Socket.IO (same CORS policy)                                         */
/* =================================================================== */
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

/* =================================================================== */
/* Start server                                                         */
/* =================================================================== */
server.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
  if (ENV_FRONTEND) console.log(`🌐 FRONTEND_URL/CLIENT_URL allowed: ${ENV_FRONTEND}`);
});
module.exports = app;
