const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();

/* ----------------------------- CORS SETUP ----------------------------- */
const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://freelanceflow-gamma.vercel.app',
];
const FRONTEND_URL = process.env.FRONTEND_URL;
const ALLOWED_ORIGINS = new Set([...LOCAL_ORIGINS, ...(FRONTEND_URL ? [FRONTEND_URL] : [])]);

app.use(cors({
  origin: (origin, cb) => !origin || ALLOWED_ORIGINS.has(origin) ? cb(null, true) : cb(new Error(`CORS blocked for origin: ${origin}`)),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  exposedHeaders: ['Content-Type','Authorization']
}));

/* -------------------------- Body Parsing -------------------------- */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* -------------------------- Logging -------------------------- */
if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path} - Origin: ${req.get('origin') || 'none'}`);
    next();
  });
}

/* -------------------------- Database -------------------------- */
if (!process.env.MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI in environment');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

/* -------------------------- Base & Health Routes -------------------------- */
app.get('/', (_req, res) => res.json({ success: true, message: 'API is running!', version: '1.0.0', timestamp: new Date().toISOString() }));
app.get('/api/__health', (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' }));

/* -------------------------- Routes -------------------------- */
app.use('/api/auth', require('./routes/auth'));
// Add other routes like /api/users, /api/projects, etc.

/* -------------------------- Error Handling -------------------------- */
app.use((error, _req, res, _next) => {
  console.error('Error:', error.message);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${_req.originalUrl} not found`,
    method: _req.method,
    availableRoutes: ['GET /', 'GET /api/__health'],
  });
});

/* -------------------------- Socket.IO Setup -------------------------- */
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => !origin || ALLOWED_ORIGINS.has(origin) ? cb(null, true) : cb(new Error(`Socket.IO CORS blocked for origin: ${origin}`)),
    methods: ['GET','POST'],
    credentials: true
  }
});
app.set('io', io);

io.on('connection', (socket) => {
  const userId = socket.handshake.query?.userId;
  if (userId) socket.join(`user:${userId}`);
  console.log(`🔌 Socket connected: ${userId || socket.id}`);
  socket.on('disconnect', () => console.log(`❌ Disconnected: ${userId || socket.id}`));
});

/* -------------------------- Start Server -------------------------- */
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));

module.exports = app; // for testing
