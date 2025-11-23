const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');

class MongoAdapter {
	constructor(uri, dbName) {
		this.uri = uri;
		this.dbName = this.resolveDatabaseName(uri, dbName);
		this.client = null;
		this.db = null;
		this.initialized = false;
		this.requiredCollections = [
			'users',
			'books',
			'transactions',
			'settings',
			'audit',
			'annualSets',
			'notificationReads'
		];
	}

	resolveDatabaseName(uri, providedName) {
		if (providedName) {
			return providedName;
		}

		if (!uri) {
			return 'olms';
		}

		const sanitized = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
		const slashIndex = sanitized.indexOf('/');
		if (slashIndex === -1) {
			return 'olms';
		}

		const path = sanitized.substring(slashIndex + 1);
		if (!path) {
			return 'olms';
		}

		const dbName = path.split('?')[0].trim();
		return dbName || 'olms';
	}

	async connect() {
		if (this.db) {
			return this.db;
		}

		if (!this.uri) {
			throw new Error('MONGO_URI is not configured. Set it in the environment to enable MongoDB mode.');
		}

		const timeout = Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 0) || 5000;
		this.client = new MongoClient(this.uri, {
			serverSelectionTimeoutMS: timeout
		});

		await this.client.connect();
		this.db = this.client.db(this.dbName);
		await this.ensureCollections();
		return this.db;
	}

	async ensureCollections() {
		if (!this.db) {
			return;
		}

		const existing = new Set(
			(await this.db.listCollections({}, { nameOnly: true }).toArray()).map(entry => entry.name)
		);

		for (const name of this.requiredCollections) {
			if (!existing.has(name)) {
				await this.db.createCollection(name);
			}
		}
	}

	normalizeDocument(doc) {
		if (!doc) {
			return null;
		}

		const normalized = { ...doc };
		if (normalized._id instanceof ObjectId) {
			normalized._id = normalized._id.toString();
		}
		if (normalized.id instanceof ObjectId) {
			normalized.id = normalized.id.toString();
		}
		return normalized;
	}

	buildFilter(query = {}) {
		const filter = {};

			Object.entries(query || {}).forEach(([key, value]) => {
			if (value === undefined) {
				return;
			}

				if (key === '$or' || key === '$and') {
					if (Array.isArray(value)) {
						filter[key] = value
							.filter(Boolean)
							.map(condition => this.buildFilter(condition));
					}
					return;
				}

			if (key === '_id') {
				if (ObjectId.isValid(value)) {
					filter._id = new ObjectId(value);
				} else {
					filter._id = value;
				}
				return;
			}

			filter[key] = value;
		});

		return filter;
	}

	buildIdFilter(id) {
		if (!id) {
			return null;
		}

		const candidates = [];

		if (typeof id === 'string') {
			candidates.push({ _id: id });
			candidates.push({ id });
			if (ObjectId.isValid(id)) {
				candidates.push({ _id: new ObjectId(id) });
			}
		} else if (id instanceof ObjectId) {
			candidates.push({ _id: id });
			candidates.push({ id: id.toString() });
		}

			if (candidates.length === 0) {
				return null;
			}

			return { $or: candidates };
	}

	prepareUpdatePayload(update = {}) {
		const payload = { ...update };
		if (!Object.prototype.hasOwnProperty.call(payload, 'updatedAt')) {
			payload.updatedAt = new Date();
		}
		return payload;
	}

	ensureDateFields(document) {
		const prepared = { ...document };
		if (prepared.createdAt && !(prepared.createdAt instanceof Date)) {
			prepared.createdAt = new Date(prepared.createdAt);
		}
		if (prepared.updatedAt && !(prepared.updatedAt instanceof Date)) {
			prepared.updatedAt = new Date(prepared.updatedAt);
		}
		return prepared;
	}

	async initialize() {
		if (this.initialized) {
			return;
		}

		await this.connect();

		const usersCollection = this.db.collection('users');

		await usersCollection.createIndex({ username: 1 }, { unique: true, sparse: true }).catch(() => {});
		await usersCollection.createIndex({ email: 1 }, { sparse: true }).catch(() => {});

		const adminUser = await usersCollection.findOne({ username: 'admin' });
		if (!adminUser) {
			const hashedPassword = await bcrypt.hash('admin123456', 10);
			const adminDocument = {
				_id: new ObjectId(),
				id: undefined,
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
					dateOfBirth: new Date('1990-01-01T00:00:00.000Z')
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

			adminDocument.id = adminDocument._id.toString();

			await usersCollection.insertOne(adminDocument);
			console.log('✅ Default admin user created for MongoDB: admin/admin123456');
		}

		this.initialized = true;
	}

	async findInCollection(collectionName, query = {}) {
		await this.connect();
		const filter = this.buildFilter(query);
		const documents = await this.db.collection(collectionName).find(filter).toArray();
		return documents.map(doc => this.normalizeDocument(doc));
	}

	async findOneInCollection(collectionName, query) {
		await this.connect();
		const filter = this.buildFilter(query);
		const document = await this.db.collection(collectionName).findOne(filter);
		return this.normalizeDocument(document);
	}

	async insertIntoCollection(collectionName, document) {
		await this.connect();
		const payload = this.ensureDateFields({ ...document });

		if (payload._id && typeof payload._id === 'string' && ObjectId.isValid(payload._id)) {
			payload._id = new ObjectId(payload._id);
		}

		if (!payload._id) {
			payload._id = new ObjectId();
		}

		if (!Object.prototype.hasOwnProperty.call(payload, 'createdAt')) {
			payload.createdAt = new Date();
		}

		payload.updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date();

		if (!payload.id) {
			payload.id = payload._id instanceof ObjectId ? payload._id.toString() : String(payload._id);
		}

		await this.db.collection(collectionName).insertOne(payload);
		return this.normalizeDocument(payload);
	}

	async updateInCollection(collectionName, query, update) {
		await this.connect();
		const filter = this.buildFilter(query);
		const payload = this.prepareUpdatePayload(update);
		const options = { returnDocument: 'after' };

		const result = await this.db.collection(collectionName).findOneAndUpdate(
			filter,
			{ $set: this.ensureDateFields(payload) },
			options
		);

		return this.normalizeDocument(result.value);
	}

	async deleteFromCollection(collectionName, query) {
		await this.connect();
		const filter = this.buildFilter(query);
		const result = await this.db.collection(collectionName).findOneAndDelete(filter);
		return this.normalizeDocument(result ? result.value : null);
	}

	async findUserByUsername(username) {
		await this.connect();
		const user = await this.db.collection('users').findOne({ username });
		return this.normalizeDocument(user);
	}

	async findUserByEmail(email) {
		await this.connect();
		const user = await this.db.collection('users').findOne({ email });
		return this.normalizeDocument(user);
	}

	async findUserById(id) {
		await this.connect();
		const filter = this.buildIdFilter(id);
		if (!filter) {
			return null;
		}
		const user = await this.db.collection('users').findOne(filter);
		return this.normalizeDocument(user);
	}

	async createUser(userData) {
		return await this.insertIntoCollection('users', userData);
	}

	async updateUser(id, updates) {
		const filter = this.buildIdFilter(id) || this.buildFilter({ _id: id });
		return await this.updateInCollection('users', filter.$or ? filter : { _id: id }, updates);
	}

	async deleteUser(id) {
		const filter = this.buildIdFilter(id) || this.buildFilter({ _id: id });
		return await this.deleteFromCollection('users', filter.$or ? filter : { _id: id });
	}

	async getAllUsers(filters = {}) {
		return await this.findInCollection('users', filters);
	}

	async getUsers(filters = {}) {
		return await this.getAllUsers(filters);
	}

	async createAuditLog(logData) {
		await this.connect();
		if (!logData || typeof logData !== 'object') {
			throw new Error('Invalid audit log payload');
		}

		const entry = { ...logData };
		entry.timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
		entry.createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();
		entry.updatedAt = entry.updatedAt ? new Date(entry.updatedAt) : new Date();

		if (entry._id && typeof entry._id === 'string' && ObjectId.isValid(entry._id)) {
			entry._id = new ObjectId(entry._id);
		}

		if (!entry._id) {
			entry._id = new ObjectId();
		}

		if (!entry.id) {
			entry.id = entry._id.toString();
		}

		await this.db.collection('audit').insertOne(entry);
		return this.normalizeDocument(entry);
	}

	async getUserStats() {
		await this.connect();
		const results = await this.db.collection('users').aggregate([
			{
				$group: {
					_id: '$role',
					count: { $sum: 1 },
					active: {
						$sum: {
							$cond: [{ $eq: ['$isActive', true] }, 1, 0]
						}
					}
				}
			}
		]).toArray();

		const total = results.reduce((acc, entry) => acc + entry.count, 0);
		const active = results.reduce((acc, entry) => acc + (entry.active || 0), 0);
		const inactive = total - active;

		return {
			total,
			active,
			inactive,
			byRole: results.map(entry => ({
				_id: entry._id || 'unknown',
				count: entry.count,
				active: entry.active || 0
			}))
		};
	}

	async testConnection() {
		try {
			await this.connect();
			const commandResult = await this.db.command({ ping: 1 });
			const userCount = await this.db.collection('users').countDocuments();
			return {
				success: Boolean(commandResult && commandResult.ok === 1),
				type: 'MongoDB',
				userCount,
				database: this.dbName,
				uri: this.uri,
				timestamp: new Date()
			};
		} catch (error) {
			return {
				success: false,
				type: 'MongoDB',
				error: error.message,
				timestamp: new Date()
			};
		}
	}

	async close() {
		if (this.client) {
			await this.client.close();
			this.client = null;
			this.db = null;
			this.initialized = false;
		}
	}
}

module.exports = MongoAdapter;
