const express = require('express');
const cors = require('cors');
// const helmet = require('helmet');
const morgan = require('morgan');
// const rateLimit = require('express-rate-limit');
const path = require('path');
const DatabaseAdapter = require('./adapters/DatabaseAdapter');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Trust proxy for rate limiting (required for accurate IP detection)
app.set('trust proxy', 1);

// Initialize offline database adapter
const dbAdapter = new DatabaseAdapter();

// Database middleware - attach database adapter to requests
app.use((req, res, next) => {
    req.dbAdapter = dbAdapter; // MongoDB adapter
    next();
});

// Security middleware
// app.use(helmet());

// Configure CORS to support both deployed and local development origins
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
        if (!origin) {
            return callback(null, true);
        }

        const isAllowedByList = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
        const isAllowedByPattern = allowedOriginPatterns.some(pattern => pattern.test(origin));

        if (isAllowedByList || isAllowedByPattern) {
            return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true
}));

// Rate limiting
// const limiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 100 // limit each IP to 100 requests per windowMs
// });
// app.use(limiter);

// Logging
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import routes
const authRoutes = require('./routes/customAuth'); // Custom JWT authentication
const userRoutes = require('./routes/users');
const studentRoutes = require('./routes/students');
const bookRoutes = require('./routes/books');
const transactionRoutes = require('./routes/transactions');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const auditRoutes = require('./routes/audit');
const departmentRoutes = require('./routes/departments');
const annualSetsRoutes = require('./routes/annualSets');
const searchRoutes = require('./routes/search');
const notificationRoutes = require('./routes/notifications');

// Route middleware
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/annual-sets', annualSetsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
// app.use('/api/transactions', transactionRoutes);
// app.use('/api/reports', reportRoutes);
// app.use('/api/settings', settingsRoutes);

// Health check endpoint
app.get('/health', async(req, res) => {
    try {
        const dbStatus = await dbAdapter.testConnection();
        res.json({
            status: 'OK',
            timestamp: new Date(),
            database: dbStatus,
            port: PORT
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error.message,
            timestamp: new Date()
        });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'OLMS Backend API',
        status: 'Running',
        timestamp: new Date(),
        port: PORT
    });
});
// app.use('/api/audit', auditRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'MongoDB'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, async() => {
    console.log(`🚀 Server running on port ${PORT}`);

    try {
        // Connect to configured database adapter
        await dbAdapter.connect();

        // Initialize database adapter (create admin user, etc.)
        await dbAdapter.initialize();

        const adapterType = typeof dbAdapter.getType === 'function' ? dbAdapter.getType() : 'unknown';
        const adapterLabel = adapterType === 'mongo' ? 'MongoDB Atlas' : adapterType === 'offline' ? 'Offline datastore' : adapterType;

        console.log(`✅ Database initialization complete using ${adapterLabel}`);
        console.log('🔗 Backend ready for connections');

    } catch (error) {
        console.error('❌ Server initialization failed:', error.message);
        console.log('⚠️ Server running without database connection');
    }
});