const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
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

// CORS configuration (allow multiple origins via env)
const resolvedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (resolvedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));

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
