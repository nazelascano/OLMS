const fs = require('fs/promises');
const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

delete process.env.USE_OFFLINE_DB;
const DatabaseAdapter = require('../adapters/DatabaseAdapter');

const DATA_DIRECTORY = path.resolve(__dirname, '..', 'data');
const COLLECTION_FILES = {
  users: 'users.json',
  books: 'books.json',
  transactions: 'transactions.json',
  settings: 'settings.json',
  audit: 'audit.json',
  annualSets: 'annualSets.json'
};

const COLLECTION_IDENTITY = {
  users: ['id', '_id', 'username', 'email'],
  books: ['id', '_id', 'bookId', 'isbn'],
  transactions: ['id', '_id'],
  settings: ['id', '_id'],
  audit: ['id', '_id'],
  annualSets: ['id', '_id', 'academicYear']
};

const DATE_LIKE_KEY = /(At|Date|On|Time|timestamp)$/i;

const stats = {
  inserted: 0,
  updated: 0,
  skipped: 0,
  errors: 0
};

const errors = [];

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

const coerceDate = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (!/\d{4}-\d{2}-\d{2}/.test(trimmed) && !trimmed.includes('T')) {
    return value;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed;
};

const deepConvertDates = (value, parentKey = '') => {
  if (Array.isArray(value)) {
    return value.map((entry) => deepConvertDates(entry));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce((acc, [key, entry]) => {
      const shouldCoerce = DATE_LIKE_KEY.test(key);
      acc[key] = shouldCoerce ? coerceDate(entry) : deepConvertDates(entry, key);
      return acc;
    }, {});
  }

  if (parentKey && DATE_LIKE_KEY.test(parentKey) && typeof value === 'string') {
    return coerceDate(value);
  }

  return value;
};

const sanitizeForUpdate = (document) => {
  const clone = { ...document };
  delete clone._id;
  return clone;
};

const loadCollectionData = async (fileName) => {
  const filePath = path.join(DATA_DIRECTORY, fileName);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) {
      return [];
    }

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      console.warn(`⚠️  Expected array in ${fileName}, skipping.`);
      return [];
    }

    return parsed.map((doc) => deepConvertDates(doc));
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`⚠️  File not found: ${fileName}, skipping.`);
      return [];
    }

    throw error;
  }
};

const buildCandidateFilters = (collection, doc) => {
  const keys = COLLECTION_IDENTITY[collection] || ['id', '_id'];
  const filters = [];

  keys.forEach((key) => {
    const value = doc[key];
    if (value !== undefined && value !== null && value !== '') {
      filters.push({ [key]: value });
    }
  });

  if (filters.length === 0 && doc.id) {
    filters.push({ id: doc.id });
  }

  if (filters.length === 0 && doc._id) {
    filters.push({ _id: doc._id });
  }

  return filters;
};

(async () => {
  console.log('📦 Migrating offline JSON collections to MongoDB...');

  const dbAdapter = new DatabaseAdapter();
  await dbAdapter.connect();
  await dbAdapter.initialize();

  const adapterType = typeof dbAdapter.getType === 'function' ? dbAdapter.getType() : 'unknown';
  if (adapterType !== 'mongo') {
    console.error('❌ DatabaseAdapter is not using MongoDB. Set USE_OFFLINE_DB=false and provide MONGODB_URI before running this script.');
    process.exit(1);
  }

  for (const [collection, file] of Object.entries(COLLECTION_FILES)) {
    console.log(`\n➡️  Processing ${collection} (${file})`);

    const documents = await loadCollectionData(file);
    if (documents.length === 0) {
      console.log('   • no documents found, skipping');
      continue;
    }

    for (const originalDoc of documents) {
      const rawDoc = { ...originalDoc };

      if (!rawDoc.id && rawDoc._id) {
        rawDoc.id = rawDoc._id;
      }

      const candidateFilters = buildCandidateFilters(collection, rawDoc);

      if (candidateFilters.length === 0) {
        stats.skipped += 1;
        errors.push({ collection, error: 'Document missing identity field', document: rawDoc });
        continue;
      }

      try {
        let existing = null;
        let matchedFilter = null;

        for (const filter of candidateFilters) {
          existing = await dbAdapter.findOneInCollection(collection, filter);
          if (existing) {
            matchedFilter = filter;
            break;
          }
        }

        if (existing && matchedFilter) {
          const updatePayload = sanitizeForUpdate(rawDoc);
          await dbAdapter.updateInCollection(collection, matchedFilter, updatePayload);
          stats.updated += 1;
        } else {
          await dbAdapter.insertIntoCollection(collection, rawDoc);
          stats.inserted += 1;
        }
      } catch (error) {
        stats.errors += 1;
        const docIdentifier = rawDoc.id || rawDoc._id || rawDoc.username || rawDoc.email || 'unknown';
        errors.push({ collection, error: error.message, document: docIdentifier });
        console.error(`   • Error syncing document ${docIdentifier}`, error);
      }
    }

    console.log(`   • processed ${documents.length} document(s)`);
  }

  console.log('\n✅ Migration complete');
  console.log(`   → inserted: ${stats.inserted}`);
  console.log(`   → updated:  ${stats.updated}`);
  console.log(`   → skipped:  ${stats.skipped}`);
  console.log(`   → errors:   ${stats.errors}`);

  if (errors.length > 0) {
    console.log('\n⚠️  Issues:');
    errors.forEach((entry) => {
      console.log(`   • [${entry.collection}] ${entry.error}`);
    });
  }

  if (dbAdapter.adapter && typeof dbAdapter.adapter.close === 'function') {
    await dbAdapter.adapter.close();
  }

  process.exit(errors.length > 0 ? 1 : 0);
})();
