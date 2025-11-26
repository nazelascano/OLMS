// Keep server.js lightweight: import configured app and start listening + DB init
require('dotenv').config();
const app = require('./app');
const DatabaseAdapter = require('./adapters/DatabaseAdapter');

const PORT = process.env.PORT || 5001;

// The app created in app.js already attaches a DatabaseAdapter instance to requests,
// but for startup we create a dedicated adapter instance here to connect and initialize.
const dbAdapter = new DatabaseAdapter();

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