const fs = require('fs').promises;
const path = require('path');

class OfflineMongoAdapter {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.collections = {
      users: 'users.json',
      books: 'books.json',
      transactions: 'transactions.json',
      settings: 'settings.json',
      audit: 'audit.json',
      annualSets: 'annualSets.json'
    };
    this.initialized = false;
  }

  async connect() {
    try {
      console.log('🔄 Initializing offline MongoDB-compatible database...');
      
      // Create data directory if it doesn't exist
      await this.ensureDataDirectory();
      
      // Initialize collection files
      await this.initializeCollections();
      
      console.log('✅ Offline database connected successfully');
      console.log('📁 Database location:', this.dataDir);
      
      return true;
    } catch (error) {
      console.error('❌ Offline database initialization failed:', error.message);
      throw error;
    }
  }

  async ensureDataDirectory() {
    try {
      await fs.access(this.dataDir);
    } catch (error) {
      // Directory doesn't exist, create it
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('📁 Created database directory:', this.dataDir);
    }
  }

  async initializeCollections() {
    for (const [collectionName, fileName] of Object.entries(this.collections)) {
      const filePath = path.join(this.dataDir, fileName);
      try {
        await fs.access(filePath);
        console.log(`✅ Collection '${collectionName}' already exists`);
      } catch (error) {
        // File doesn't exist, create it with empty array
        await fs.writeFile(filePath, JSON.stringify([], null, 2));
        console.log(`📄 Created collection '${collectionName}'`);
      }
    }
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Check if admin user exists
      const users = await this.findInCollection('users', { username: 'admin' });
      
      if (users.length === 0) {
        // Create default admin user
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123456', 10);
        
        const adminUser = {
          _id: this.generateObjectId(),
          username: 'admin',
          email: 'admin@olms.com',
          password: hashedPassword,
          firstName: 'System',
          lastName: 'Administrator',
          role: 'admin',
          isActive: true,
          profile: {
            phone: '000-000-0000',
            address: 'System',
            dateOfBirth: new Date('1990-01-01')
          },
          library: {
            cardNumber: 'ADMIN-001',
            membershipDate: new Date(),
            borrowingLimit: 999,
            fineBalance: 0
          },
          borrowingStats: {
            totalBorrowed: 0,
            currentlyBorrowed: 0,
            totalFines: 0,
            totalReturned: 0
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await this.insertIntoCollection('users', adminUser);
        console.log('✅ Default admin user created: admin/admin123456');
      } else {
        console.log('✅ Admin user already exists');
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('❌ Error initializing offline database:', error);
      throw error;
    }
  }

  // Collection operations
  async readCollection(collectionName) {
    const fileName = this.collections[collectionName];
    if (!fileName) throw new Error(`Unknown collection: ${collectionName}`);
    
    const filePath = path.join(this.dataDir, fileName);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error reading collection ${collectionName}:`, error);
      return [];
    }
  }

  async writeCollection(collectionName, data) {
    const fileName = this.collections[collectionName];
    if (!fileName) throw new Error(`Unknown collection: ${collectionName}`);
    
    const filePath = path.join(this.dataDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  // MongoDB-like operations
  async findInCollection(collectionName, query = {}) {
    const data = await this.readCollection(collectionName);
    
    if (Object.keys(query).length === 0) {
      return data; // Return all if no query
    }
    
    return data.filter(item => {
      return Object.keys(query).every(key => {
        if (key.includes('.')) {
          // Handle nested properties like 'profile.phone'
          const keys = key.split('.');
          let value = item;
          for (const k of keys) {
            value = value && value[k];
          }
          return value === query[key];
        }
        return item[key] === query[key];
      });
    });
  }

  async findOneInCollection(collectionName, query) {
    const results = await this.findInCollection(collectionName, query);
    return results.length > 0 ? results[0] : null;
  }

  async insertIntoCollection(collectionName, document) {
    const data = await this.readCollection(collectionName);
    
    // Add _id if not present
    if (!document._id) {
      document._id = this.generateObjectId();
    }
    
    // Add timestamps
    document.createdAt = document.createdAt || new Date();
    document.updatedAt = new Date();
    
    data.push(document);
    await this.writeCollection(collectionName, data);
    
    return document;
  }

  async updateInCollection(collectionName, query, update) {
    const data = await this.readCollection(collectionName);
    let updated = null;
    
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const matches = Object.keys(query).every(key => item[key] === query[key]);
      
      if (matches) {
        // Merge update into existing item
        data[i] = { ...item, ...update, updatedAt: new Date() };
        updated = data[i];
        break;
      }
    }
    
    if (updated) {
      await this.writeCollection(collectionName, data);
    }
    
    return updated;
  }

  async deleteFromCollection(collectionName, query) {
    const data = await this.readCollection(collectionName);
    let deleted = null;
    
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const matches = Object.keys(query).every(key => item[key] === query[key]);
      
      if (matches) {
        deleted = data.splice(i, 1)[0];
        break;
      }
    }
    
    if (deleted) {
      await this.writeCollection(collectionName, data);
    }
    
    return deleted;
  }

  // User-specific methods (for compatibility with existing code)
  async findUserByUsername(username) {
    return await this.findOneInCollection('users', { username });
  }

  async findUserByEmail(email) {
    return await this.findOneInCollection('users', { email });
  }

  async findUserById(id) {
    return await this.findOneInCollection('users', { _id: id });
  }

  async createUser(userData) {
    return await this.insertIntoCollection('users', userData);
  }

  async updateUser(id, updates) {
    return await this.updateInCollection('users', { _id: id }, updates);
  }

  async deleteUser(id) {
    return await this.deleteFromCollection('users', { _id: id });
  }

  async getAllUsers(filters = {}) {
    return await this.findInCollection('users', filters);
  }

  async getUsers(filters = {}) {
    return this.getAllUsers(filters);
  }

  // Utility methods
  generateObjectId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  async createAuditLog(logData) {
    if (!logData || typeof logData !== 'object') {
      throw new Error('Invalid audit log payload');
    }

    const objectId = logData._id || this.generateObjectId();
    const entryId = logData.id || objectId;

    const entry = {
      ...logData,
      id: entryId,
      _id: objectId,
      timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Keep most recent 1000 entries to avoid runaway file growth
    const logs = await this.readCollection('audit');
    logs.push(entry);

    logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const MAX_LOGS = 1000;
    const trimmed = logs.slice(-MAX_LOGS);

    await this.writeCollection('audit', trimmed);

    return entry;
  }

  async testConnection() {
    try {
      const userCount = (await this.readCollection('users')).length;
      return { 
        success: true, 
        type: 'Offline MongoDB-Compatible', 
        userCount,
        dataLocation: this.dataDir,
        timestamp: new Date()
      };
    } catch (error) {
      return { 
        success: false, 
        type: 'Offline MongoDB-Compatible', 
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Statistics
  async getUserStats() {
    try {
      const users = await this.readCollection('users');
      const stats = {};
      
      users.forEach(user => {
        const role = user.role || 'unknown';
        if (!stats[role]) {
          stats[role] = { count: 0, active: 0 };
        }
        stats[role].count++;
        if (user.isActive) {
          stats[role].active++;
        }
      });
      
      return {
        total: users.length,
        active: users.filter(u => u.isActive).length,
        inactive: users.filter(u => !u.isActive).length,
        byRole: Object.keys(stats).map(role => ({
          _id: role,
          count: stats[role].count,
          active: stats[role].active
        }))
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }
}

module.exports = OfflineMongoAdapter;