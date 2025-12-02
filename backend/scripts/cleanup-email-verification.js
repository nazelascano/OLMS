const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const DatabaseAdapter = require('../adapters/DatabaseAdapter');

(async () => {
  console.log('🧹 Cleaning up email verification fields from users collection...');

  const dbAdapter = new DatabaseAdapter();
  try {
    await dbAdapter.connect();
    await dbAdapter.initialize();
  } catch (err) {
    console.error('❌ Failed to initialize database adapter:', err && err.message ? err.message : err);
    process.exit(1);
  }

  const adapterType = typeof dbAdapter.getType === 'function' ? dbAdapter.getType() : 'unknown';

  try {
    if (adapterType === 'mongo' && dbAdapter.adapter && dbAdapter.adapter.db) {
      // Use raw MongoDB driver for atomic update with $unset
      const result = await dbAdapter.adapter.db.collection('users').updateMany({}, { $unset: { emailVerified: '', emailVerifiedAt: '' } });
      console.log(`✅ Mongo: Modified ${result.modifiedCount} documents, matched ${result.matchedCount}`);
    } else if (adapterType === 'offline') {
      // Offline adapter: read all users and update each one to remove fields
      const users = await dbAdapter.findInCollection('users', {});
      let modified = 0;
      for (const user of users) {
        // Build update object with explicit undefined values to remove them in JSON write
        const update = { emailVerified: undefined, emailVerifiedAt: undefined };
        const updated = await dbAdapter.updateInCollection('users', { _id: user._id }, update);
        if (updated) modified += 1;
      }
      console.log(`✅ Offline: Updated ${modified} user documents`);
    } else {
      // Fallback universal method: read all users and, if possible, write cleaned user back
      const users = await dbAdapter.findInCollection('users', {});
      let modified = 0;
      for (const user of users) {
        const cleaned = { ...user };
        delete cleaned.emailVerified;
        delete cleaned.emailVerifiedAt;

        // If database is Mongo, try using adapter.db, otherwise use updateInCollection
        if (dbAdapter.adapter && dbAdapter.adapter.db) {
          const filter = { _id: user._id };
          await dbAdapter.adapter.db.collection('users').replaceOne(filter, cleaned).then((res) => {
            if (res.modifiedCount && res.modifiedCount > 0) modified += res.modifiedCount;
          }).catch(() => {});
        } else {
          await dbAdapter.updateInCollection('users', { _id: user._id }, cleaned);
          modified += 1;
        }
      }
      console.log(`✅ Fallback: Updated ${modified} user documents`);
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error && error.message ? error.message : error);
    process.exit(1);
  } finally {
    if (dbAdapter.adapter && typeof dbAdapter.adapter.close === 'function') {
      await dbAdapter.adapter.close();
    }
  }

  console.log('🎉 Email verification cleanup completed successfully!');
})();