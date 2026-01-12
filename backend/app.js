const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
const os = require('os');
const DatabaseAdapter = require('./adapters/DatabaseAdapter');
require('dotenv').config();

const app = express();

// Initialize offline/database adapter (do not connect here; server startup will call connect()).
// The instance is shared with server.js so requests use the same connected adapter.
const dbAdapter = new DatabaseAdapter();
app.set('dbAdapter', dbAdapter);

// Attach dbAdapter to requests
app.use((req, res, next) => {
  req.dbAdapter = dbAdapter;
  next();
});

// CORS configuration (allow multiple origins + wildcards via env)
const frontendPort = Number(process.env.FRONTEND_PORT || process.env.DEV_SERVER_PORT || 3001);

const getLanOrigins = (port) => {
  const interfaces = os.networkInterfaces();
  const lanOrigins = new Set();

  Object.values(interfaces).forEach((addresses = []) => {
    addresses.forEach((address) => {
      if (!address || address.internal || address.family !== 'IPv4') {
        return;
      }
      lanOrigins.add(`http://${address.address}:${port}`);
    });
  });

  return Array.from(lanOrigins);
};

const devFallbackOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  ...getLanOrigins(frontendPort),
];
const explicitOriginList = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const derivedFallbackOrigins = [];
if (process.env.FRONTEND_URL) {
  derivedFallbackOrigins.push(process.env.FRONTEND_URL.trim());
}

const resolvedOrigins = Array.from(new Set([
  ...explicitOriginList,
  ...derivedFallbackOrigins,
  ...devFallbackOrigins,
])).filter(Boolean);

const allowAllInDev = (process.env.NODE_ENV || '').trim() !== 'production';

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const originMatchers = resolvedOrigins.map((entry) => {
  if (!entry) {
    return null;
  }
  if (entry.includes('*')) {
    const regexPattern = `^${escapeRegex(entry).replace(/\\\*/g, '.*')}$`;
    return { type: 'wildcard', regex: new RegExp(regexPattern) };
  }
  return { type: 'exact', value: entry };
}).filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!originMatchers.length) {
    return false;
  }
  return originMatchers.some((matcher) => {
    if (matcher.type === 'wildcard') {
      return matcher.regex.test(origin);
    }
    return matcher.value === origin;
  });
};

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    if (allowAllInDev) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  exposedHeaders: ['x-session-refresh', 'x-session-refresh-lifetime'],
}));

app.use(cookieParser());

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded assets (avatars, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const authRoutes = require('./routes/customAuth');
const userRoutes = require('./routes/users');
const studentRoutes = require('./routes/students');
const bookRoutes = require('./routes/books');
const transactionRoutes = require('./routes/transactions');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const auditRoutes = require('./routes/audit');
const curriculumRoutes = require('./routes/curriculum');
const annualSetsRoutes = require('./routes/annualSets');
const searchRoutes = require('./routes/search');
const notificationRoutes = require('./routes/notifications');
const locationRoutes = require('./routes/locations');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/annual-sets', annualSetsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/locations', locationRoutes);

// Simple health and root endpoints
app.get('/health', async(req, res) => {
  try {
    const dbStatus = await dbAdapter.testConnection();
    res.json({ status: 'OK', timestamp: new Date(), database: dbStatus });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message, timestamp: new Date() });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'OLMS Backend API', status: 'Running', timestamp: new Date() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: process.env.NODE_ENV === 'development' ? err.message : {} });
});

// 404
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
module.exports.dbAdapter = dbAdapter;
