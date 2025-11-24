const DEFAULT_CACHE_TTL_MS = parseInt(process.env.SETTINGS_CACHE_TTL_MS, 10) || 5000;

const DEFAULT_OPERATING_HOURS = {
  monday: { open: '08:00', close: '18:00', closed: false },
  tuesday: { open: '08:00', close: '18:00', closed: false },
  wednesday: { open: '08:00', close: '18:00', closed: false },
  thursday: { open: '08:00', close: '18:00', closed: false },
  friday: { open: '08:00', close: '18:00', closed: false },
  saturday: { open: '09:00', close: '17:00', closed: false },
  sunday: { open: '10:00', close: '16:00', closed: true },
};

const BORROWING_DEFAULTS = {
  maxBooksPerTransaction: 10,
  maxBorrowDays: 14,
  maxRenewals: 2,
  finePerDay: 5,
  gracePeriodDays: 0,
  maxFineAmount: 0,
  reservationPeriodDays: 3,
  enableFines: true,
  annualBorrowingEnabled: true,
  overnightBorrowingEnabled: false,
  allowRenewalsWithOverdue: false,
};

const SYSTEM_DEFAULTS = {
  maintenanceMode: false,
  allowRegistration: true,
  requireEmailVerification: true,
  sessionTimeoutMinutes: 60,
  maxLoginAttempts: 5,
  backupFrequency: 'daily',
  logRetentionDays: 90,
  auditLogging: true,
  schoolYearStart: '2024-08-01',
  schoolYearEnd: '2025-05-31',
};

const NOTIFICATION_DEFAULTS = {
  emailNotifications: true,
  smsNotifications: false,
  dueDateReminders: true,
  overdueNotifications: true,
  reservationNotifications: true,
  reminderDaysBefore: 3,
  maxReminders: 3,
  emailTemplate: {
    dueDate: '',
    overdue: '',
    reservation: '',
  },
};

let cache = {
  data: null,
  expiresAt: 0,
};

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return fallback;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mergeOperatingHours = (incoming = {}) => {
  const merged = {};
  Object.entries(DEFAULT_OPERATING_HOURS).forEach(([day, defaults]) => {
    const source = incoming[day] || {};
    merged[day] = {
      open: typeof source.open === 'string' ? source.open : defaults.open,
      close: typeof source.close === 'string' ? source.close : defaults.close,
      closed: typeof source.closed === 'boolean' ? source.closed : defaults.closed,
    };
  });
  return merged;
};

const mapSettingsRecords = (records = []) => {
  return records.reduce((acc, record) => {
    if (record && record.id) {
      acc[record.id] = record.value;
    }
    return acc;
  }, {});
};

const buildLibraryProfile = (settingsMap) => ({
  libraryName: settingsMap.LIBRARY_NAME || '',
  libraryAddress: settingsMap.LIBRARY_ADDRESS || '',
  libraryPhone: settingsMap.LIBRARY_PHONE || '',
  libraryEmail: settingsMap.LIBRARY_EMAIL || '',
  website: settingsMap.LIBRARY_WEBSITE || '',
  description: settingsMap.LIBRARY_DESCRIPTION || '',
  operatingHours: mergeOperatingHours(settingsMap.OPERATING_HOURS),
});

const buildBorrowingSettings = (settingsMap) => ({
  maxBooksPerTransaction: toNumber(
    settingsMap.MAX_BOOKS_PER_TRANSACTION,
    BORROWING_DEFAULTS.maxBooksPerTransaction,
  ),
  maxBorrowDays: toNumber(settingsMap.MAX_BORROW_DAYS, BORROWING_DEFAULTS.maxBorrowDays),
  maxRenewals: toNumber(settingsMap.MAX_RENEWALS, BORROWING_DEFAULTS.maxRenewals),
  finePerDay: toNumber(settingsMap.FINE_PER_DAY, BORROWING_DEFAULTS.finePerDay),
  gracePeriodDays: toNumber(settingsMap.GRACE_PERIOD_DAYS, BORROWING_DEFAULTS.gracePeriodDays),
  maxFineAmount: toNumber(settingsMap.MAX_FINE_AMOUNT, BORROWING_DEFAULTS.maxFineAmount),
  reservationPeriodDays: toNumber(
    settingsMap.RESERVATION_PERIOD_DAYS,
    BORROWING_DEFAULTS.reservationPeriodDays,
  ),
  enableFines: toBoolean(settingsMap.ENABLE_FINES, BORROWING_DEFAULTS.enableFines),
  annualBorrowingEnabled: toBoolean(
    settingsMap.ANNUAL_BORROWING_ENABLED,
    BORROWING_DEFAULTS.annualBorrowingEnabled,
  ),
  overnightBorrowingEnabled: toBoolean(
    settingsMap.OVERNIGHT_BORROWING_ENABLED,
    BORROWING_DEFAULTS.overnightBorrowingEnabled,
  ),
  allowRenewalsWithOverdue: toBoolean(
    settingsMap.ALLOW_RENEWALS_WITH_OVERDUE,
    BORROWING_DEFAULTS.allowRenewalsWithOverdue,
  ),
});

const buildNotificationSettings = (rawValue) => {
  const value = isPlainObject(rawValue) ? rawValue : {};
  return {
    ...NOTIFICATION_DEFAULTS,
    ...value,
    emailNotifications: toBoolean(
      value.emailNotifications,
      NOTIFICATION_DEFAULTS.emailNotifications,
    ),
    smsNotifications: toBoolean(value.smsNotifications, NOTIFICATION_DEFAULTS.smsNotifications),
    dueDateReminders: toBoolean(value.dueDateReminders, NOTIFICATION_DEFAULTS.dueDateReminders),
    overdueNotifications: toBoolean(
      value.overdueNotifications,
      NOTIFICATION_DEFAULTS.overdueNotifications,
    ),
    reservationNotifications: toBoolean(
      value.reservationNotifications,
      NOTIFICATION_DEFAULTS.reservationNotifications,
    ),
    reminderDaysBefore: toNumber(
      value.reminderDaysBefore,
      NOTIFICATION_DEFAULTS.reminderDaysBefore,
    ),
    maxReminders: toNumber(value.maxReminders, NOTIFICATION_DEFAULTS.maxReminders),
    emailTemplate: {
      ...NOTIFICATION_DEFAULTS.emailTemplate,
      ...(isPlainObject(value.emailTemplate) ? value.emailTemplate : {}),
    },
  };
};

const getNotificationChannelState = (settings = NOTIFICATION_DEFAULTS) => {
  const normalized = settings || NOTIFICATION_DEFAULTS;
  const emailEnabled = normalized.emailNotifications !== false;
  const smsEnabled = normalized.smsNotifications === true;
  const channels = [];
  if (emailEnabled) {
    channels.push('email');
  }
  if (smsEnabled) {
    channels.push('sms');
  }
  return {
    emailEnabled,
    smsEnabled,
    channels,
    hasActiveChannel: channels.length > 0,
  };
};

const buildSystemSettings = (settingsMap) => ({
  maintenanceMode: toBoolean(settingsMap.MAINTENANCE_MODE, SYSTEM_DEFAULTS.maintenanceMode),
  allowRegistration: toBoolean(
    settingsMap.ALLOW_REGISTRATION,
    SYSTEM_DEFAULTS.allowRegistration,
  ),
  requireEmailVerification: toBoolean(
    settingsMap.REQUIRE_EMAIL_VERIFICATION,
    SYSTEM_DEFAULTS.requireEmailVerification,
  ),
  sessionTimeoutMinutes: toNumber(
    settingsMap.SESSION_TIMEOUT_MINUTES,
    SYSTEM_DEFAULTS.sessionTimeoutMinutes,
  ),
  maxLoginAttempts: toNumber(
    settingsMap.MAX_LOGIN_ATTEMPTS,
    SYSTEM_DEFAULTS.maxLoginAttempts,
  ),
  backupFrequency: settingsMap.BACKUP_FREQUENCY || SYSTEM_DEFAULTS.backupFrequency,
  logRetentionDays: toNumber(
    settingsMap.LOG_RETENTION_DAYS,
    SYSTEM_DEFAULTS.logRetentionDays,
  ),
  auditLogging: toBoolean(settingsMap.AUDIT_LOGGING_ENABLED, SYSTEM_DEFAULTS.auditLogging),
  schoolYearStart: settingsMap.SCHOOL_YEAR_START || SYSTEM_DEFAULTS.schoolYearStart,
  schoolYearEnd: settingsMap.SCHOOL_YEAR_END || SYSTEM_DEFAULTS.schoolYearEnd,
});

const buildSnapshot = (settingsMap) => {
  const notificationsSetting = settingsMap.NOTIFICATION_SETTINGS;
  return {
    raw: settingsMap,
    library: buildLibraryProfile(settingsMap),
    borrowing: buildBorrowingSettings(settingsMap),
    notifications: buildNotificationSettings(notificationsSetting),
    system: buildSystemSettings(settingsMap),
  };
};

const getCacheTtl = () => {
  const parsed = parseInt(process.env.SETTINGS_CACHE_TTL_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_TTL_MS;
};

const loadSettingsFromDb = async (dbAdapter) => {
  if (!dbAdapter || typeof dbAdapter.findInCollection !== 'function') {
    throw new Error('Database adapter is required to load settings');
  }
  const records = await dbAdapter.findInCollection('settings', {});
  return mapSettingsRecords(records);
};

const getSettingsSnapshot = async (dbAdapter, { forceRefresh = false } = {}) => {
  const now = Date.now();
  if (!forceRefresh && cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  const settingsMap = await loadSettingsFromDb(dbAdapter);
  const snapshot = buildSnapshot(settingsMap);
  cache = {
    data: snapshot,
    expiresAt: now + getCacheTtl(),
  };
  return snapshot;
};

const invalidateSettingsCache = () => {
  cache = { data: null, expiresAt: 0 };
};

module.exports = {
  getSettingsSnapshot,
  invalidateSettingsCache,
  buildSnapshot,
  BORROWING_DEFAULTS,
  SYSTEM_DEFAULTS,
  NOTIFICATION_DEFAULTS,
  getNotificationChannelState,
  toBoolean,
  toNumber,
};
