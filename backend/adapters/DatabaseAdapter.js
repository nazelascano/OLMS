const OfflineMongoAdapter = require('./OfflineMongoAdapter');
const MongoAdapter = require('./MongoAdapter');

class DatabaseAdapter {
  constructor() {
    const useOfflineFlag = (process.env.USE_OFFLINE_DB || '').trim().toLowerCase();
    const forceOffline = useOfflineFlag === 'true' || useOfflineFlag === '1' || useOfflineFlag === 'yes';
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
    const mongoDbName = process.env.MONGO_DB_NAME || process.env.MONGODB_DB_NAME || process.env.DB_NAME || undefined;
    const hasMongoUri = Boolean(mongoUri);

    // Prefer Mongo when a URI is provided and offline isn't forced.
    // Actual connection is attempted in `connect()` so we can gracefully
    // fall back to the Offline adapter if Mongo is unreachable.
    if (!forceOffline && hasMongoUri) {
      this.adapter = new MongoAdapter(mongoUri, mongoDbName);
      this.adapterType = 'mongo';
    } else {
      this.adapter = new OfflineMongoAdapter();
      this.adapterType = 'offline';
    }

    this.initialized = false;
  }

  getType() {
    return this.adapterType;
  }

  async connect() {
    // Attempt to connect using the currently selected adapter.
    // If the Mongo adapter is selected but fails to connect (network down,
    // Atlas unreachable, etc.), fall back to the Offline adapter automatically.
    try {
      const result = await this.adapter.connect();
      return result;
    } catch (err) {
      // If already using the offline adapter, propagate the error.
      if (this.adapterType === 'offline') {
        throw err;
      }

      // Otherwise, log the failure and switch to the offline adapter.
      console.warn('⚠️ MongoDB connection failed, switching to offline datastore.');
      console.warn('Mongo error:', err && err.message ? err.message : err);

      try {
        this.adapter = new OfflineMongoAdapter();
        this.adapterType = 'offline';
        const fallbackResult = await this.adapter.connect();
        console.log('✅ Switched to offline datastore');
        return fallbackResult;
      } catch (fallbackErr) {
        console.error('❌ Failed to initialize offline datastore after Mongo failure:', fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr);
        // Re-throw original error (or fallback error) so callers know startup failed.
        throw fallbackErr || err;
      }
    }
  }

  async initialize() {
    if (this.initialized) return;
    if (typeof this.adapter.initialize === 'function') {
      await this.adapter.initialize();
    }
    this.initialized = true;
  }

  // User operations - delegate to offline adapter
  async findUserByUsername(username) {
    return await this.adapter.findUserByUsername(username);
  }

  async findUserByEmail(email) {
    return await this.adapter.findUserByEmail(email);
  }

  async findUserById(id) {
    return await this.adapter.findUserById(id);
  }

  async createUser(userData) {
    return await this.adapter.createUser(userData);
  }

  async updateUser(id, updates) {
    return await this.adapter.updateUser(id, updates);
  }

  async deleteUser(id) {
    return await this.adapter.deleteUser(id);
  }

  async getAllUsers(filters = {}) {
    return await this.adapter.getAllUsers(filters);
  }

  // Legacy method for compatibility
  async getUsers(filters = {}) {
    return await this.adapter.getUsers(filters);
  }

  // General collection operations
  async findInCollection(collectionName, query = {}) {
    return await this.adapter.findInCollection(collectionName, query);
  }

  async findOneInCollection(collectionName, query) {
    return await this.adapter.findOneInCollection(collectionName, query);
  }

  async insertIntoCollection(collectionName, document) {
    return await this.adapter.insertIntoCollection(collectionName, document);
  }

  async updateInCollection(collectionName, query, update) {
    return await this.adapter.updateInCollection(collectionName, query, update);
  }

  async deleteFromCollection(collectionName, query) {
    return await this.adapter.deleteFromCollection(collectionName, query);
  }

  async createAuditLog(logData) {
    if (typeof this.adapter.createAuditLog !== 'function') {
      throw new Error('Audit logging not supported by current adapter');
    }
    return await this.adapter.createAuditLog(logData);
  }

  // Statistics
  async getUserStats() {
    return await this.adapter.getUserStats();
  }

  // Health check
  async testConnection() {
    return await this.adapter.testConnection();
  }
}

module.exports = DatabaseAdapter;