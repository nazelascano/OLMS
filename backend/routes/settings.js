const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, requireLibrarian, logAction, setAuditContext } = require('../middleware/customAuth');
const { invalidateSettingsCache } = require('../utils/settingsCache');
const {
    DEFAULT_CURRICULA,
    DEFAULT_GRADE_LEVELS,
    DEFAULT_GRADE_STRUCTURE,
    normalizeStringList,
    normalizeGradeStructure
} = require('../utils/userAttributes');
const router = express.Router();

const LIBRARY_CATEGORY = 'library';
const LEGACY_LIBRARY_CATEGORIES = [LIBRARY_CATEGORY, 'receipt'];
const SYSTEM_CATEGORY = 'system';
const NOTIFICATION_CATEGORY = 'notifications';
const USER_CATEGORY = 'user';
const DEFAULT_LIBRARY_TIMEZONE = process.env.LIBRARY_TIMEZONE || 'Asia/Manila';
const BRANDING_STORAGE_DIR = path.join(__dirname, '..', 'uploads', 'branding');
const ALLOWED_BRANDING_MIME_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg'
};
const BRANDING_FILE_FIELD = 'brandingAsset';
const MAX_BRANDING_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ensureDirectory = async(dirPath) => {
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
};

const sanitizeBrandingSlot = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'background') {
        return 'background';
    }
    return 'logo';
};

const brandingStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        ensureDirectory(BRANDING_STORAGE_DIR)
            .then(() => cb(null, BRANDING_STORAGE_DIR))
            .catch((error) => cb(error));
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const randomSuffix = Math.round(Math.random() * 1e9);
        const extensionFromMime = ALLOWED_BRANDING_MIME_TYPES[file.mimetype];
        const extensionFromName = path.extname(file.originalname || '').toLowerCase();
        const allowedExtensions = new Set(Object.values(ALLOWED_BRANDING_MIME_TYPES));
        const resolvedExtension = extensionFromMime || (allowedExtensions.has(extensionFromName) ? extensionFromName : '.png');
        cb(null, `branding-${timestamp}-${randomSuffix}${resolvedExtension}`);
    }
});

const brandingFileFilter = (req, file, cb) => {
    if (ALLOWED_BRANDING_MIME_TYPES[file.mimetype]) {
        return cb(null, true);
    }
    return cb(new Error('Unsupported file type. Please upload a JPG, PNG, GIF, WEBP, or SVG image.'));
};

const brandingUpload = multer({
    storage: brandingStorage,
    fileFilter: brandingFileFilter,
    limits: {
        fileSize: MAX_BRANDING_SIZE_BYTES
    }
});

const BRANDING_UPLOAD_ERROR_LIMIT_MESSAGE = 'Image is too large. Maximum allowed size is 5 MB.';

const buildBrandingUrl = (filename = '') => {
    const safeName = path.basename(filename);
    return path.posix.join('/uploads/branding', safeName);
};

const toBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no'].includes(normalized)) {
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

const updateOrCreateSetting = async (dbAdapter, userId, {
    id,
    value,
    type,
    category = LIBRARY_CATEGORY,
    description
}) => {
    const existing = await dbAdapter.findOneInCollection('settings', { id });
    const timestamp = new Date();

    if (existing) {
        const updateData = {
            value,
            type: type || existing.type,
            category: category || existing.category || LIBRARY_CATEGORY,
            updatedAt: timestamp,
            updatedBy: userId
        };

        if (description !== undefined) {
            updateData.description = description;
        }

        await dbAdapter.updateInCollection('settings', { id }, updateData);
        return;
    }

    await dbAdapter.insertIntoCollection('settings', {
        id,
        value,
        type: type || typeof value,
        category,
        description: description || '',
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: userId,
        updatedBy: userId
    });
};

const applySettingsUpdates = async (dbAdapter, userId, updates = []) => {
    for (const item of updates) {
        await updateOrCreateSetting(dbAdapter, userId, item);
    }
};

// Get all settings (Librarian+)
router.get('/', verifyToken, requireLibrarian, async(req, res) => {
    try {
        let settings = await req.dbAdapter.findInCollection('settings', {});

        // Sort by category
        settings.sort((a, b) => (a.category || '').localeCompare(b.category || ''));

        res.json(settings);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
});

// Get settings by category (specific routes for frontend)
router.get('/library', async(req, res) => {
    try {
        const [librarySettings, legacyReceiptSettings] = await Promise.all(
            LEGACY_LIBRARY_CATEGORIES.map((category) =>
                req.dbAdapter.findInCollection('settings', { category })
            )
        );

        // Process legacy "receipt" records first so current "library" entries override them.
        const combinedSettings = [...legacyReceiptSettings, ...librarySettings];
        const index = combinedSettings.reduce((acc, setting) => {
            acc[setting.id] = setting.value;
            return acc;
        }, {});

        const response = {
            libraryName: index.LIBRARY_NAME || '',
            libraryAddress: index.LIBRARY_ADDRESS || '',
            libraryPhone: index.LIBRARY_PHONE || '',
            libraryEmail: index.LIBRARY_EMAIL || '',
            website: index.LIBRARY_WEBSITE || '',
            description: index.LIBRARY_DESCRIPTION || '',
            openingTime: index.LIBRARY_OPENING_TIME || '08:00',
            closingTime: index.LIBRARY_CLOSING_TIME || '17:00',
            operatingDays: Array.isArray(index.LIBRARY_OPERATING_DAYS) ? index.LIBRARY_OPERATING_DAYS : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            timezone: index.LIBRARY_TIMEZONE || DEFAULT_LIBRARY_TIMEZONE,
            loginLogoUrl: index.LIBRARY_LOGIN_LOGO || '',
            loginMotto: index.LIBRARY_LOGIN_MOTTO || '',
            loginBackgroundUrl: index.LIBRARY_LOGIN_BACKGROUND || '',
        };

        res.json(response);
    } catch (error) {
        console.error('Get library settings error:', error);
        res.status(500).json({ message: 'Failed to fetch library settings' });
    }
});

router.get('/borrowing-rules', verifyToken, async(req, res) => {
    try {
        const settings = await req.dbAdapter.findInCollection('settings', { category: LIBRARY_CATEGORY });
        const index = settings.reduce((acc, setting) => {
            acc[setting.id] = setting.value;
            return acc;
        }, {});

        const response = {
            maxBooksPerTransaction: toNumber(index.MAX_BOOKS_PER_TRANSACTION, 10),
            maxBorrowDays: toNumber(index.MAX_BORROW_DAYS, 14),
            finePerDay: toNumber(index.FINE_PER_DAY, 5),
            gracePeriodDays: toNumber(index.GRACE_PERIOD_DAYS, 0),
            maxFineAmount: toNumber(index.MAX_FINE_AMOUNT, 0),
            reservationPeriodDays: toNumber(index.RESERVATION_PERIOD_DAYS, 3),
            enableFines: toBoolean(index.ENABLE_FINES, true),
            annualBorrowingEnabled: toBoolean(index.ANNUAL_BORROWING_ENABLED, true),
            overnightBorrowingEnabled: toBoolean(index.OVERNIGHT_BORROWING_ENABLED, false)
        };

        res.json(response);
    } catch (error) {
        console.error('Get borrowing-rules settings error:', error);
        res.status(500).json({ message: 'Failed to fetch borrowing-rules settings' });
    }
});

router.get('/notifications', verifyToken, requireLibrarian, async(req, res) => {
    try {
        const setting = await req.dbAdapter.findOneInCollection('settings', { id: 'NOTIFICATION_SETTINGS' });
        const defaults = {
            dueDateReminders: true,
            overdueNotifications: true,
            reservationNotifications: true,
            returnNotifications: true,
            reminderDaysBefore: 3,
            maxReminders: 3
        };

        const value = setting?.value || {};
        const response = {
            ...defaults,
            ...value
        };

        res.json(response);
    } catch (error) {
        console.error('Get notifications settings error:', error);
        res.status(500).json({ message: 'Failed to fetch notifications settings' });
    }
});

router.get('/user-attributes', verifyToken, async(req, res) => {
    try {
        const [curriculaSetting, gradeLevelsSetting, gradeStructureSetting] = await Promise.all([
            req.dbAdapter.findOneInCollection('settings', { id: 'USER_CURRICULA' }),
            req.dbAdapter.findOneInCollection('settings', { id: 'USER_GRADE_LEVELS' }),
            req.dbAdapter.findOneInCollection('settings', { id: 'USER_GRADE_STRUCTURE' })
        ]);

        const curriculumOptions = normalizeStringList(curriculaSetting?.value, DEFAULT_CURRICULA);
        const rawStructureSource = Array.isArray(gradeStructureSetting?.value)
            ? gradeStructureSetting.value
            : Array.isArray(gradeLevelsSetting?.value)
                ? gradeLevelsSetting.value
                : DEFAULT_GRADE_STRUCTURE;

        const gradeStructure = normalizeGradeStructure(rawStructureSource, DEFAULT_GRADE_STRUCTURE);
        const gradeLevelFallback = gradeStructure.map((entry) => entry.grade);
        const gradeLevels = normalizeStringList(
            Array.isArray(gradeLevelsSetting?.value) ? gradeLevelsSetting.value : gradeLevelFallback,
            gradeLevelFallback.length > 0 ? gradeLevelFallback : DEFAULT_GRADE_LEVELS
        );

        res.json({
            curriculum: curriculumOptions,
            gradeLevels,
            gradeStructure
        });
    } catch (error) {
        console.error('Get user attributes settings error:', error);
        res.status(500).json({ message: 'Failed to fetch user attributes' });
    }
});

router.get('/system', verifyToken, requireLibrarian, async(req, res) => {
    try {
        const settings = await req.dbAdapter.findInCollection('settings', {});
        const index = settings.reduce((acc, setting) => {
            acc[setting.id] = setting.value;
            return acc;
        }, {});

        const response = {
            maintenanceMode: toBoolean(index.MAINTENANCE_MODE, false),
            sessionTimeoutMinutes: toNumber(index.SESSION_TIMEOUT_MINUTES, 60),
            maxLoginAttempts: toNumber(index.MAX_LOGIN_ATTEMPTS, 5),
            passwordPolicy: {
                minLength: toNumber(index.PASSWORD_MIN_LENGTH, 8),
            },
            backupFrequency: index.BACKUP_FREQUENCY || 'daily',
            logRetentionDays: toNumber(index.LOG_RETENTION_DAYS, 90),
            auditLogging: toBoolean(index.AUDIT_LOGGING_ENABLED, true),
            schoolYearStart: index.SCHOOL_YEAR_START || '2024-08-01',
            schoolYearEnd: index.SCHOOL_YEAR_END || '2025-05-31'
        };

        res.json(response);
    } catch (error) {
        console.error('Get system settings error:', error);
        res.status(500).json({ message: 'Failed to fetch system settings' });
    }
});

router.put('/library', verifyToken, requireLibrarian, logAction('UPDATE', 'settings-library'), async(req, res) => {
    try {
        const {
            libraryName = '',
            libraryAddress = '',
            libraryPhone = '',
            libraryEmail = '',
            website = '',
            description = '',
            openingTime = '08:00',
            closingTime = '17:00',
            operatingDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            timezone = DEFAULT_LIBRARY_TIMEZONE,
            loginLogoUrl = '',
            loginMotto = '',
            loginBackgroundUrl = '',
        } = req.body || {};

        const updates = [
            { id: 'LIBRARY_NAME', value: libraryName, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_ADDRESS', value: libraryAddress, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_PHONE', value: libraryPhone, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_EMAIL', value: libraryEmail, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_WEBSITE', value: website, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_DESCRIPTION', value: description, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_OPENING_TIME', value: openingTime, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_CLOSING_TIME', value: closingTime, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_OPERATING_DAYS', value: Array.isArray(operatingDays) ? operatingDays : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], type: 'array', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_TIMEZONE', value: timezone, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_LOGIN_LOGO', value: loginLogoUrl, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_LOGIN_MOTTO', value: loginMotto, type: 'string', category: LIBRARY_CATEGORY },
            { id: 'LIBRARY_LOGIN_BACKGROUND', value: loginBackgroundUrl, type: 'string', category: LIBRARY_CATEGORY },
        ];

        await applySettingsUpdates(req.dbAdapter, req.user.id, updates);
        invalidateSettingsCache();
        invalidateSettingsCache();

        setAuditContext(req, {
            success: true,
            status: 'Updated',
            description: 'Updated library settings'
        });

        res.json({ message: 'Library settings saved successfully' });
    } catch (error) {
        console.error('Update library settings error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Library settings update failed: ${error.message}`
        });
        res.status(500).json({ message: 'Failed to save library settings' });
    }
});

const resolveBrandingUploadErrorMessage = (error) => {
    if (!error) {
        return 'Failed to upload branding image.';
    }
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return BRANDING_UPLOAD_ERROR_LIMIT_MESSAGE;
        }
        return error.message || 'Upload failed due to an unexpected upload error.';
    }
    return error.message || 'Failed to upload branding image.';
};

router.post('/library/branding/upload', verifyToken, requireLibrarian, logAction('UPLOAD', 'settings-library-branding'), (req, res) => {
    brandingUpload.single(BRANDING_FILE_FIELD)(req, res, (uploadError) => {
        if (uploadError) {
            const message = resolveBrandingUploadErrorMessage(uploadError);
            setAuditContext(req, {
                success: false,
                status: 'Error',
                description: `Branding upload failed: ${message}`
            });
            return res.status(400).json({ message });
        }

        const uploadedFile = req.file;

        if (!uploadedFile) {
            setAuditContext(req, {
                success: false,
                status: 'Error',
                description: 'Branding upload failed: no file provided'
            });
            return res.status(400).json({ message: `Please provide an image file using the "${BRANDING_FILE_FIELD}" field.` });
        }

        const resolvedSlot = sanitizeBrandingSlot(req.body?.slot);
        const relativeUrl = buildBrandingUrl(uploadedFile.filename);

        setAuditContext(req, {
            success: true,
            status: 'Uploaded',
            description: `Uploaded login branding asset for ${resolvedSlot}`
        });

        return res.json({
            message: 'Branding image uploaded successfully',
            url: relativeUrl,
            filename: uploadedFile.filename,
            slot: resolvedSlot
        });
    });
});

router.put('/borrowing-rules', verifyToken, requireLibrarian, logAction('UPDATE', 'settings-borrowing'), async(req, res) => {
    try {
        const {
            maxBooksPerTransaction,
            maxBorrowDays,
            finePerDay,
            gracePeriodDays,
            maxFineAmount,
            reservationPeriodDays,
            enableFines,
            annualBorrowingEnabled,
            overnightBorrowingEnabled
        } = req.body || {};

        const updates = [
            { id: 'MAX_BOOKS_PER_TRANSACTION', value: toNumber(maxBooksPerTransaction, 0), type: 'number' },
            { id: 'MAX_BORROW_DAYS', value: toNumber(maxBorrowDays, 0), type: 'number' },
            { id: 'FINE_PER_DAY', value: toNumber(finePerDay, 0), type: 'number' },
            { id: 'GRACE_PERIOD_DAYS', value: toNumber(gracePeriodDays, 0), type: 'number' },
            { id: 'MAX_FINE_AMOUNT', value: toNumber(maxFineAmount, 0), type: 'number' },
            { id: 'RESERVATION_PERIOD_DAYS', value: toNumber(reservationPeriodDays, 0), type: 'number' },
            { id: 'ENABLE_FINES', value: toBoolean(enableFines, true), type: 'boolean' },
            { id: 'ANNUAL_BORROWING_ENABLED', value: toBoolean(annualBorrowingEnabled, true), type: 'boolean' },
            { id: 'OVERNIGHT_BORROWING_ENABLED', value: toBoolean(overnightBorrowingEnabled, false), type: 'boolean' }
        ];

        await applySettingsUpdates(req.dbAdapter, req.user.id, updates);

        setAuditContext(req, {
            success: true,
            status: 'Updated',
            description: 'Updated borrowing rules settings'
        });

        res.json({ message: 'Borrowing rules saved successfully' });
    } catch (error) {
        console.error('Update borrowing rules error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Borrowing rules update failed: ${error.message}`
        });
        res.status(500).json({ message: 'Failed to save borrowing rules' });
    }
});

router.put('/notifications', verifyToken, requireLibrarian, logAction('UPDATE', 'settings-notifications'), async(req, res) => {
    try {
        const {
            dueDateReminders = true,
            overdueNotifications = true,
            reservationNotifications = true,
            returnNotifications = true,
            reminderDaysBefore = 3,
            maxReminders = 3
        } = req.body || {};

        const normalized = {
            dueDateReminders: toBoolean(dueDateReminders, true),
            overdueNotifications: toBoolean(overdueNotifications, true),
            reservationNotifications: toBoolean(reservationNotifications, true),
            returnNotifications: toBoolean(returnNotifications, true),
            reminderDaysBefore: toNumber(reminderDaysBefore, 0),
            maxReminders: toNumber(maxReminders, 0)
        };

        await updateOrCreateSetting(req.dbAdapter, req.user.id, {
            id: 'NOTIFICATION_SETTINGS',
            value: normalized,
            type: 'object',
            category: NOTIFICATION_CATEGORY
        });
        invalidateSettingsCache();

        setAuditContext(req, {
            success: true,
            status: 'Updated',
            description: 'Updated notification settings'
        });

        res.json({ message: 'Notification settings saved successfully' });
    } catch (error) {
        console.error('Update notification settings error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Notification settings update failed: ${error.message}`
        });
        res.status(500).json({ message: 'Failed to save notification settings' });
    }
});

router.put('/user-attributes', verifyToken, requireLibrarian, logAction('UPDATE', 'settings-user-attributes'), async(req, res) => {
    try {
        const {
            curriculum = [],
            gradeLevels = [],
            gradeStructure = []
        } = req.body || {};

        const normalizedCurriculum = normalizeStringList(curriculum, DEFAULT_CURRICULA);
        const normalizedGradeStructure = normalizeGradeStructure(
            Array.isArray(gradeStructure) && gradeStructure.length > 0 ? gradeStructure : gradeLevels,
            DEFAULT_GRADE_STRUCTURE,
            { useFallbackWhenEmpty: false }
        );
        const structureGradeNames = normalizedGradeStructure.map((entry) => entry.grade);
        const normalizedGradeLevels = normalizeStringList(
            gradeLevels && gradeLevels.length > 0 ? gradeLevels : structureGradeNames,
            structureGradeNames.length > 0 ? structureGradeNames : DEFAULT_GRADE_LEVELS
        );

        await applySettingsUpdates(req.dbAdapter, req.user.id, [
            {
                id: 'USER_CURRICULA',
                value: normalizedCurriculum,
                type: 'array',
                category: USER_CATEGORY,
                description: 'Configured curriculum options for users and students'
            },
            {
                id: 'USER_GRADE_LEVELS',
                value: normalizedGradeLevels,
                type: 'array',
                category: USER_CATEGORY,
                description: 'Configured grade level options for users and students'
            },
            {
                id: 'USER_GRADE_STRUCTURE',
                value: normalizedGradeStructure,
                type: 'array',
                category: USER_CATEGORY,
                description: 'Configured grade levels with section options'
            }
        ]);
        invalidateSettingsCache();

        setAuditContext(req, {
            success: true,
            status: 'Updated',
            description: 'Updated user attribute settings'
        });

        res.json({ message: 'User attributes saved successfully' });
    } catch (error) {
        console.error('Update user attributes settings error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `User attributes update failed: ${error.message}`
        });
        res.status(500).json({ message: 'Failed to save user attributes' });
    }
});

router.put('/system', verifyToken, requireLibrarian, logAction('UPDATE', 'settings-system'), async(req, res) => {
    try {
        const {
            maintenanceMode,
            sessionTimeoutMinutes,
            maxLoginAttempts,
            passwordPolicy = {},
            backupFrequency,
            logRetentionDays,
            auditLogging
        } = req.body || {};

        const updates = [
            { id: 'MAINTENANCE_MODE', value: toBoolean(maintenanceMode, false), type: 'boolean', category: SYSTEM_CATEGORY },
            { id: 'SESSION_TIMEOUT_MINUTES', value: toNumber(sessionTimeoutMinutes, 60), type: 'number', category: SYSTEM_CATEGORY },
            { id: 'MAX_LOGIN_ATTEMPTS', value: toNumber(maxLoginAttempts, 5), type: 'number', category: SYSTEM_CATEGORY },
            { id: 'BACKUP_FREQUENCY', value: backupFrequency || 'daily', type: 'string', category: SYSTEM_CATEGORY },
            { id: 'LOG_RETENTION_DAYS', value: toNumber(logRetentionDays, 90), type: 'number', category: SYSTEM_CATEGORY },
            { id: 'AUDIT_LOGGING_ENABLED', value: toBoolean(auditLogging, true), type: 'boolean', category: SYSTEM_CATEGORY }
        ];

        const normalizedPolicy = {
            minLength: toNumber(passwordPolicy.minLength, 8),
        };

        const policyUpdates = [
            { id: 'PASSWORD_MIN_LENGTH', value: normalizedPolicy.minLength, type: 'number', category: SYSTEM_CATEGORY }
        ];

        await applySettingsUpdates(req.dbAdapter, req.user.id, [...updates, ...policyUpdates]);
        invalidateSettingsCache();

        setAuditContext(req, {
            success: true,
            status: 'Updated',
            description: 'Updated system settings'
        });

        res.json({ message: 'System settings saved successfully' });
    } catch (error) {
        console.error('Update system settings error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `System settings update failed: ${error.message}`
        });
        res.status(500).json({ message: 'Failed to save system settings' });
    }
});

// Get settings by category (generic route)
router.get('/category/:category', verifyToken, requireLibrarian, async(req, res) => {
    try {
        const category = req.params.category;

        const settings = await req.dbAdapter.findInCollection('settings', { category });

        res.json(settings);
    } catch (error) {
        console.error('Get settings by category error:', error);
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
});

// Get specific setting
router.get('/:key', verifyToken, requireLibrarian, async(req, res) => {
    try {
        const setting = await req.dbAdapter.findOneInCollection('settings', { id: req.params.key });

        if (!setting) {
            return res.status(404).json({ message: 'Setting not found' });
        }

        res.json(setting);
    } catch (error) {
        console.error('Get setting error:', error);
        res.status(500).json({ message: 'Failed to fetch setting' });
    }
});

// Update setting (Admin only)
router.put('/:key', verifyToken, requireLibrarian, logAction('UPDATE', 'setting'), async(req, res) => {
    try {
        const { value, description } = req.body;
        const settingKey = req.params.key;

        setAuditContext(req, {
            entityId: settingKey,
            metadata: {
                updateRequest: {
                    key: settingKey,
                    hasValue: value !== undefined,
                    hasDescription: description !== undefined
                }
            }
        });

        // Check if setting exists
        const setting = await req.dbAdapter.findOneInCollection('settings', { id: settingKey });
        if (!setting) {
            setAuditContext(req, {
                success: false,
                status: 'SettingNotFound',
                description: `Setting update failed: ${settingKey} not found`
            });
            return res.status(404).json({ message: 'Setting not found' });
        }

        const updateData = {
            updatedAt: new Date(),
            updatedBy: req.user.id
        };

        if (value !== undefined) updateData.value = value;
        if (description !== undefined) updateData.description = description;

        await req.dbAdapter.updateInCollection('settings', { id: settingKey }, updateData);
        invalidateSettingsCache();

        setAuditContext(req, {
            success: true,
            status: 'Updated',
            entityId: settingKey,
            resourceId: settingKey,
            description: `Updated setting ${settingKey}`,
            metadata: {
                actorId: req.user.id
            },
            details: {
                updatedFields: Object.keys(updateData).filter(key => key !== 'updatedAt' && key !== 'updatedBy')
            }
        });

        res.json({ message: 'Setting updated successfully' });
    } catch (error) {
        console.error('Update setting error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Setting update failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to update setting' });
    }
});

// Create new setting (Admin only)
router.post('/', verifyToken, requireLibrarian, logAction('CREATE', 'setting'), async(req, res) => {
    try {
        const { key, value, type, category, description } = req.body;

        setAuditContext(req, {
            entityId: key || null,
            metadata: {
                createRequest: {
                    key: key || null,
                    hasValue: value !== undefined,
                    type: type || null,
                    category: category || null
                }
            }
        });

        if (!key || value === undefined || !type || !category) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Setting creation failed: missing required fields'
            });
            return res.status(400).json({ message: 'Key, value, type, and category are required' });
        }

        // Check if setting already exists
        const existingSetting = await req.dbAdapter.findOneInCollection('settings', { id: key });
        if (existingSetting) {
            setAuditContext(req, {
                success: false,
                status: 'Conflict',
                description: `Setting creation failed: ${key} already exists`
            });
            return res.status(400).json({ message: 'Setting already exists' });
        }

        const settingData = {
            id: key,
            value,
            type,
            category,
            description: description || '',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: req.user.id
        };

        await req.dbAdapter.insertIntoCollection('settings', settingData);
        invalidateSettingsCache();

        setAuditContext(req, {
            success: true,
            status: 'Created',
            entityId: key,
            resourceId: key,
            description: `Created setting ${key}`,
            metadata: {
                actorId: req.user.id
            }
        });

        res.status(201).json({ message: 'Setting created successfully' });
    } catch (error) {
        console.error('Create setting error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Setting creation failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to create setting' });
    }
});

// Delete setting (Admin only)
router.delete('/:key', verifyToken, requireLibrarian, logAction('DELETE', 'setting'), async(req, res) => {
    try {
        const settingKey = req.params.key;

        setAuditContext(req, {
            entityId: settingKey
        });

        // Check if setting exists
        const setting = await req.dbAdapter.findOneInCollection('settings', { id: settingKey });
        if (!setting) {
            setAuditContext(req, {
                success: false,
                status: 'SettingNotFound',
                description: `Setting deletion failed: ${settingKey} not found`
            });
            return res.status(404).json({ message: 'Setting not found' });
        }

        await req.dbAdapter.deleteFromCollection('settings', { id: settingKey });
        invalidateSettingsCache();

        setAuditContext(req, {
            success: true,
            status: 'Deleted',
            entityId: settingKey,
            resourceId: settingKey,
            description: `Deleted setting ${settingKey}`,
            metadata: {
                actorId: req.user.id
            }
        });

        res.json({ message: 'Setting deleted successfully' });
    } catch (error) {
        console.error('Delete setting error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Setting deletion failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to delete setting' });
    }
});

// Reset settings to defaults (Admin only)
router.post('/reset/defaults', verifyToken, requireLibrarian, logAction('RESET_DEFAULTS', 'setting'), async(req, res) => {
    try {
        setAuditContext(req, {
            metadata: {
                resetDefaultsRequest: {
                    count: 8
                }
            }
        });
        const defaultSettings = [
            { id: 'MAX_BORROW_DAYS', value: 14, type: 'number', category: 'library', description: 'Maximum number of days for regular book borrowing' },
            { id: 'FINE_PER_DAY', value: 5, type: 'number', category: 'library', description: 'Fine amount per day for overdue books' },
            { id: 'SCHOOL_YEAR_START', value: '2024-08-01', type: 'string', category: 'library', description: 'School year start date' },
            { id: 'SCHOOL_YEAR_END', value: '2025-05-31', type: 'string', category: 'library', description: 'School year end date' },
            { id: 'LIBRARY_NAME', value: 'ONHS Library', type: 'string', category: LIBRARY_CATEGORY, description: 'Library name for receipts' },
            { id: 'LIBRARY_ADDRESS', value: 'School Address', type: 'string', category: LIBRARY_CATEGORY, description: 'Library address for receipts' },
            { id: 'ENABLE_FINES', value: true, type: 'boolean', category: 'library', description: 'Enable or disable fine system' },
            { id: 'MAX_BOOKS_PER_TRANSACTION', value: 10, type: 'number', category: 'library', description: 'Maximum number of books per transaction' }
        ];

        for (const setting of defaultSettings) {
            const existing = await req.dbAdapter.findOneInCollection('settings', { id: setting.id });

            const settingData = {
                ...setting,
                createdAt: existing ? existing.createdAt : new Date(),
                updatedAt: new Date(),
                createdBy: existing ? existing.createdBy : req.user.id
            };

            if (existing) {
                await req.dbAdapter.updateInCollection('settings', { id: setting.id }, settingData);
            } else {
                await req.dbAdapter.insertIntoCollection('settings', settingData);
            }
        }

        invalidateSettingsCache();

        setAuditContext(req, {
            success: true,
            status: 'Completed',
            description: 'Reset settings to default values',
            metadata: {
                actorId: req.user.id,
                totalApplied: defaultSettings.length
            }
        });

        res.json({ message: 'Settings reset to defaults successfully' });
    } catch (error) {
        console.error('Reset defaults error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Reset settings failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to reset settings' });
    }
});

router.post('/backup', verifyToken, requireLibrarian, logAction('BACKUP', 'system'), async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');

    const backupDir = path.join(__dirname, '../backups');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}`);
    await fs.mkdir(backupPath, { recursive: true });

    const collections = ['users', 'books', 'transactions', 'settings', 'audit', 'notifications'];

    for (const collection of collections) {
      const data = await req.dbAdapter.findInCollection(collection, {});
      const filePath = path.join(backupPath, `${collection}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    setAuditContext(req, {
      success: true,
      description: `Backup created at ${backupPath}`,
      metadata: { backupPath, collections }
    });

    res.json({ message: 'Backup created successfully', path: backupPath });
  } catch (error) {
    console.error('Backup error:', error);
    setAuditContext(req, {
      success: false,
      description: `Backup failed: ${error.message}`,
      details: { error: error.message }
    });
    res.status(500).json({ message: 'Backup failed' });
  }
});

router.post('/cleanup-logs', verifyToken, requireLibrarian, logAction('CLEANUP_LOGS', 'system'), async (req, res) => {
  try {
    const systemSettings = req.systemSettings;
    const retentionDays = systemSettings?.logRetentionDays || 90;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Assuming deleteFromCollection returns the number of deleted documents
    const deletedCount = await req.dbAdapter.deleteFromCollection('audit', { timestamp: { $lt: cutoff } });

    setAuditContext(req, {
      success: true,
      description: `Cleaned up audit logs older than ${retentionDays} days`,
      metadata: { retentionDays, deletedCount, cutoff }
    });

    res.json({ message: `Cleaned up ${deletedCount || 'some'} old audit logs` });
  } catch (error) {
    console.error('Cleanup logs error:', error);
    setAuditContext(req, {
      success: false,
      description: `Log cleanup failed: ${error.message}`,
      details: { error: error.message }
    });
    res.status(500).json({ message: 'Log cleanup failed' });
  }
});

module.exports = router;