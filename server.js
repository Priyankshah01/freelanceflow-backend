// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();

/* ----------------------------- CORS SETUP ----------------------------- */
/** Allow local dev + frontend URL from env (Vercel/Render) */
const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];
const FRONTEND_URL = process.env.FRONTEND_URL; // e.g. https://freelanceflow-gamma.vercel.app
const ALLOWED_ORIGINS = new Set([...LOCAL_ORIGINS, ...(FRONTEND_URL ? [FRONTEND_URL] : [])]);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow non-browser tools (no Origin) & allowed origins
    if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));


/* -------------------------- Body Parsing & Logging -------------------------- */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path} - Origin: ${req.get('origin') || 'none'}`);
    next();
  });
}

/* -------------------------- Database Connection -------------------------- */
if (!process.env.MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI in environment');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

/* -------------------------- Base & Health Routes -------------------------- */
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'FreelanceFlow API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/__health', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

/* -------------------------- Safe Route Loader -------------------------- */
const safeUse = (path, modPath, label) => {
  try {
    app.use(path, require(modPath));
    console.log(`✅ ${label} routes loaded`);
  } catch (e) {
    console.log(`⚠️  ${label} routes not found (${modPath})`);
  }
};

safeUse('/api/auth', './routes/auth', 'Auth');
safeUse('/api/users', './routes/users', 'User');
safeUse('/api/projects', './routes/projects', 'Project');
safeUse('/api/proposals', './routes/proposals', 'Proposal');
safeUse('/api/admin', './routes/admin', 'Admin');

/* -------------------------- Error Handling -------------------------- */
app.use((error, _req, res, _next) => {
  console.error('Error:', error.message);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    method: req.method,
    availableRoutes: ['GET /', 'GET /api/__health'],
  });
});

/* -------------------------- Socket.IO Setup -------------------------- */
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error(`Socket.IO CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  const userId = socket.handshake.query?.userId;
  if (userId) {
    socket.join(`user:${userId}`);
    console.log(`🔌 User connected to room: user:${userId}`);
  } else {
    console.log(`🔌 Socket connected: ${socket.id}`);
  }

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${userId || socket.id}`);
  });
});

/* -------------------------- Start Server -------------------------- */
server.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
  if (FRONTEND_URL) console.log(`🌐 FRONTEND_URL: ${FRONTEND_URL}`);
});

module.exports = app; // optional for testing
