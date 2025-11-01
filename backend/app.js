const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const DatabaseAdapter = require('./adapters/DatabaseAdapter');
require('dotenv').config();

const app = express();

// Initialize offline/database adapter (do not connect here; server startup will call connect())
const dbAdapter = new DatabaseAdapter();

// Attach dbAdapter to requests
app.use((req, res, next) => {
  req.dbAdapter = dbAdapter;
  next();
});

// CORS configuration (keep same defaults as server.js)
const defaultOrigins = ['http://localhost:3000', 'http://localhost:3001'];
const envOrigins = [process.env.FRONTEND_URL, process.env.CORS_ALLOWED_ORIGINS]
  .filter(Boolean)
  .flatMap(origins => origins.split(',').map(origin => origin.trim()))
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

const staticOriginPatterns = [/\.vercel\.app$/];
const envOriginPatternValues = (process.env.CORS_ALLOWED_ORIGIN_PATTERNS || '')
  .split(',')
  .map(pattern => pattern.trim())
  .filter(Boolean);
const allowedOriginPatterns = [
  ...staticOriginPatterns,
  ...envOriginPatternValues.map(pattern => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      console.warn(`Invalid CORS origin pattern: ${pattern}`, error.message);
      return null;
    }
  }).filter(Boolean)
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowedByList = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
    const isAllowedByPattern = allowedOriginPatterns.some(pattern => pattern.test(origin));
    if (isAllowedByList || isAllowedByPattern) return callback(null, true);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
