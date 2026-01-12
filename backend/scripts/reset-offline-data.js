const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcrypt');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const COLLECTION_FILES = {
  users: 'users.json',
  books: 'books.json',
  transactions: 'transactions.json',
  notifications: 'notifications.json',
  notificationReads: 'notificationReads.json',
  settings: 'settings.json',
  audit: 'audit.json',
  annualSets: 'annualSets.json'
};

const SETTINGS_TEMPLATE = [
  { id: 'MAX_BORROW_DAYS', value: 14, type: 'number', category: 'library', description: 'Maximum number of days for regular book borrowing' },
  { id: 'FINE_PER_DAY', value: 5, type: 'number', category: 'library', description: 'Fine amount per day for overdue books' },
  { id: 'SCHOOL_YEAR_START', value: '2024-08-01', type: 'string', category: 'library', description: 'School year start date' },
  { id: 'SCHOOL_YEAR_END', value: '2025-05-31', type: 'string', category: 'library', description: 'School year end date' },
  { id: 'LIBRARY_NAME', value: 'ONHS Library', type: 'string', category: 'library', description: 'Library name for receipts' },
  { id: 'LIBRARY_ADDRESS', value: 'School Address', type: 'string', category: 'library', description: 'Library address for receipts' },
  { id: 'ENABLE_FINES', value: true, type: 'boolean', category: 'library', description: 'Enable or disable fine system' },
  { id: 'MAX_BOOKS_PER_TRANSACTION', value: 10, type: 'number', category: 'library', description: 'Maximum number of books per transaction' }
];

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
};

const ensureDataDirectory = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
};

const ensureCollectionFiles = async () => {
  await Promise.all(
    Object.values(COLLECTION_FILES).map(async (fileName) => {
      const filePath = path.join(DATA_DIR, fileName);
      if (await fileExists(filePath)) {
        return;
      }

      await fs.writeFile(filePath, '[]\n');
    })
  );
};

const backupFile = async (filePath) => {
  if (!(await fileExists(filePath))) {
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak.${stamp}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
};

const readCollection = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  if (!content.trim()) {
    return [];
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️  Could not parse ${path.basename(filePath)}. Writing empty array.`);
    return [];
  }
};

const writeCollection = async (filePath, data) => {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
};

const isAdminAccount = (user) => {
  if (!user || typeof user !== 'object') {
    return false;
  }

  const username = (user.username || '').trim().toLowerCase();
  const email = (user.email || '').trim().toLowerCase();
  const role = (user.role || '').trim().toLowerCase();

  return username === 'admin' || email === 'admin@olms.com' || role === 'admin';
};

const generateObjectId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const sanitizeAdmin = (user) => {
  const now = new Date().toISOString();

  return {
    _id: user._id || generateObjectId(),
    username: 'admin',
    email: user.email || 'admin@olms.com',
    password: user.password,
    firstName: user.firstName || 'System',
    lastName: user.lastName || 'Administrator',
    role: 'admin',
    isActive: true,
    profile: {
      phone: user.profile?.phone || '000-000-0000',
      address: user.profile?.address || 'System',
      dateOfBirth: user.profile?.dateOfBirth || '1990-01-01T00:00:00.000Z'
    },
    library: {
      cardNumber: user.library?.cardNumber || 'ADMIN-001',
      membershipDate: user.library?.membershipDate || now,
      borrowingLimit: user.library?.borrowingLimit || 999,
      fineBalance: user.library?.fineBalance || 0
    },
    borrowingStats: {
      totalBorrowed: 0,
      currentlyBorrowed: 0,
      totalFines: 0,
      totalReturned: 0,
      ...user.borrowingStats
    },
    createdAt: user.createdAt || now,
    updatedAt: now,
    lastLoginAt: user.lastLoginAt || now,
    lastActivityAt: user.lastActivityAt || now
  };
};

const createDefaultAdmin = async () => {
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  return {
    _id: generateObjectId(),
    username: 'admin',
    email: 'admin@olms.com',
    password: passwordHash,
    firstName: 'System',
    lastName: 'Administrator',
    role: 'admin',
    isActive: true,
    profile: {
      phone: '000-000-0000',
      address: 'System',
      dateOfBirth: '1990-01-01T00:00:00.000Z'
    },
    library: {
      cardNumber: 'ADMIN-001',
      membershipDate: now,
      borrowingLimit: 999,
      fineBalance: 0
    },
    borrowingStats: {
      totalBorrowed: 0,
      currentlyBorrowed: 0,
      totalFines: 0,
      totalReturned: 0
    },
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    lastActivityAt: now
  };
};

const buildDefaultSettings = () => {
  const now = new Date().toISOString();
  return SETTINGS_TEMPLATE.map((entry) => ({
    ...entry,
    createdAt: now,
    updatedAt: now
  }));
};

const resetUsers = async (filePath) => {
  const users = await readCollection(filePath);
  const existingAdmin = users.find((user) => isAdminAccount(user));
  const adminRecord = existingAdmin ? sanitizeAdmin(existingAdmin) : await createDefaultAdmin();
  await writeCollection(filePath, [adminRecord]);
  return existingAdmin ? 'preserved existing admin' : 'created fresh admin';
};

const resetCollection = async (collectionName, payloadBuilder = () => []) => {
  const filePath = path.join(DATA_DIR, COLLECTION_FILES[collectionName]);
  await backupFile(filePath);
  const payload = typeof payloadBuilder === 'function' ? await payloadBuilder() : payloadBuilder;
  await writeCollection(filePath, payload);
};

(async () => {
  console.log('🧹 Resetting offline datastore...');
  await ensureDataDirectory();
  await ensureCollectionFiles();

  const userStatus = await (async () => {
    const userFile = path.join(DATA_DIR, COLLECTION_FILES.users);
    await backupFile(userFile);
    return await resetUsers(userFile);
  })();

  const collectionsToClear = Object.keys(COLLECTION_FILES).filter((name) => name !== 'users' && name !== 'settings');
  for (const collection of collectionsToClear) {
    await resetCollection(collection);
    console.log(`   • cleared ${collection}`);
  }

  await resetCollection('settings', buildDefaultSettings);
  console.log('   • repopulated settings with defaults');

  console.log(`✅ Offline users reset (${userStatus})`);
  console.log('✅ Offline datastore ready. Start the backend with USE_OFFLINE_DB=true to verify.');
})().catch((error) => {
  console.error('❌ Failed to reset offline datastore:', error);
  process.exit(1);
});
