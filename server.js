// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();
const app = express();

/* ======================= CORS ======================= */
const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// accept either var name; use FRONTEND_URL in prod
const ENV_FRONTEND = process.env.FRONTEND_URL || process.env.CLIENT_URL || '';

const FIXED_PROD_ORIGINS = [
  'https://freelanceflow-gamma.vercel.app', // your Vercel domain
];

// allow any *.vercel.app preview
const VERCEL_PREVIEW_REGEX = /^https:\/\/([a-z0-9-]+\.)?vercel\.app$/i;

const ALLOWED = new Set([
  ...LOCAL_ORIGINS,
  ...FIXED_PROD_ORIGINS,
  ...(ENV_FRONTEND ? [ENV_FRONTEND] : []),
]);

const corsOrigin = (origin, cb) => {
  if (!origin) return cb(null, true); // curl/Postman/non-browser
  if (ALLOWED.has(origin)) return cb(null, true);
  if (VERCEL_PREVIEW_REGEX.test(origin)) return cb(null, true);
  return cb(new Error(`CORS blocked for origin: ${origin}`));
};

const corsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  exposedHeaders: ['Content-Type','Authorization'],
};

app.use(cors(corsOptions));
// Express 5-safe preflight (no wildcard pattern)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ================= Parsing & logging ================= */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path} | Origin: ${req.get('origin') || 'none'}`);
    next();
  });
}

/* ================== Database ================== */
if (!process.env.MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

/* ================= Health & echo ================= */
app.get('/', (_req, res) => res.json({ success: true, message: 'API running', ts: new Date().toISOString() }));
app.get('/api/__health', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'development', ts: new Date().toISOString() }));
app.get('/api/__echo', (req, res) => res.json({
  ok: true, method: req.method, url: req.originalUrl,
  host: req.get('host'), origin: req.get('origin') || null, ts: new Date().toISOString()
}));

/* ================= Routes ================= */
const authRoutes = require('./routes/auth');      // will throw if missing → good
app.use('/api/auth', authRoutes);
try {
  app.use('/api/admin', require('./routes/admin'));
} catch {
  console.log('⚠️ admin routes missing; skipping');
}

/* ================= Errors & 404 ================= */
app.use((err, _req, res, _next) => {
  console.error('Error:', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    ...(err.details && { errors: err.details }),
  });
});
app.use((req, res) => res.status(404).json({
  success: false, message: `Route ${req.originalUrl} not found`, method: req.method
}));

/* ================= Socket.IO ================= */
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET','POST'], credentials: true }
});
app.set('io', io);
io.on('connection', (socket) => {
  const userId = socket.handshake.query?.userId;
  if (userId) socket.join(`user:${userId}`);
  console.log(`🔌 Socket: ${userId || socket.id}`);
  socket.on('disconnect', () => console.log(`❌ Disconnected: ${userId || socket.id}`));
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
  if (ENV_FRONTEND) console.log(`🌐 Allowed FRONTEND: ${ENV_FRONTEND}`);
});

module.exports = app;
