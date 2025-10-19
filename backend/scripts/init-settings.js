const DatabaseAdapter = require('../adapters/DatabaseAdapter');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data');
const dbAdapter = new DatabaseAdapter(dataPath);

async function initializeSettings() {
  try {
    console.log('Initializing default settings...');
    
    const defaultSettings = [
      { id: 'MAX_BORROW_DAYS', value: 14, type: 'number', category: 'library', description: 'Maximum number of days for regular book borrowing' },
      { id: 'FINE_PER_DAY', value: 5, type: 'number', category: 'library', description: 'Fine amount per day for overdue books' },
      { id: 'SCHOOL_YEAR_START', value: '2024-08-01', type: 'string', category: 'library', description: 'School year start date' },
      { id: 'SCHOOL_YEAR_END', value: '2025-05-31', type: 'string', category: 'library', description: 'School year end date' },
      { id: 'LIBRARY_NAME', value: 'ONHS Library', type: 'string', category: 'library', description: 'Library name for receipts' },
      { id: 'LIBRARY_ADDRESS', value: 'School Address', type: 'string', category: 'library', description: 'Library address for receipts' },
      { id: 'ENABLE_FINES', value: true, type: 'boolean', category: 'library', description: 'Enable or disable fine system' },
      { id: 'MAX_BOOKS_PER_TRANSACTION', value: 10, type: 'number', category: 'library', description: 'Maximum number of books per transaction' }
    ];

    for (const setting of defaultSettings) {
      const existing = await dbAdapter.findOneInCollection('settings', { id: setting.id });
      
      const settingData = {
        ...setting,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (existing) {
        await dbAdapter.updateInCollection('settings', { id: setting.id }, settingData);
        console.log(`Updated setting: ${setting.id}`);
      } else {
        await dbAdapter.insertIntoCollection('settings', settingData);
        console.log(`Created setting: ${setting.id}`);
      }
    }

    console.log('✅ Default settings initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing settings:', error);
  }
}

initializeSettings();
