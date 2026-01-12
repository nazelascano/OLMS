// Keep server.js lightweight: import configured app and start listening + DB init
require('dotenv').config();
const app = require('./app');
const DatabaseAdapter = require('./adapters/DatabaseAdapter');

const PORT = process.env.PORT || 5001;

// Reuse the adapter instance that app.js injects into every request so the
// connection established here is the same one routes use at runtime. If that
// reference is missing (older builds/tests), fall back to a new instance and
// store it back on the app for consistency.
const exportedAdapter = app && app.dbAdapter ? app.dbAdapter : null;
const dbAdapter = exportedAdapter || new DatabaseAdapter();

if (!exportedAdapter) {
    app.dbAdapter = dbAdapter;
    if (typeof app.set === 'function') {
        app.set('dbAdapter', dbAdapter);
    }
}

const server = app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);

    try {
        await dbAdapter.connect();
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

server.on('error', (error) => {
    console.error('❌ Server error:', error?.message || error);
});

server.on('close', () => {
    console.warn('⚠️ HTTP server closed');
});

process.on('SIGINT', () => {
    console.warn('⚠️ Received SIGINT, shutting down server');
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    console.warn('⚠️ Received SIGTERM, shutting down server');
    server.close(() => process.exit(0));
});

process.on('exit', (code) => {
    console.warn(`⚠️ Process exiting with code ${code}`);
});