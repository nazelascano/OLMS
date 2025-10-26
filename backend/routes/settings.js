const express = require('express');
const { verifyToken, requireAdmin, requireLibrarian, logAction, setAuditContext } = require('../middleware/customAuth');
const {
    DEFAULT_CURRICULA,
    DEFAULT_GRADE_LEVELS,
    normalizeStringList
} = require('../utils/userAttributes');
const router = express.Router();

const LIBRARY_CATEGORY = 'library';
const SYSTEM_CATEGORY = 'system';
const NOTIFICATION_CATEGORY = 'notifications';
const USER_CATEGORY = 'user';
const DEFAULT_OPERATING_HOURS = {
    monday: { open: '08:00', close: '18:00', closed: false },
    tuesday: { open: '08:00', close: '18:00', closed: false },
    wednesday: { open: '08:00', close: '18:00', closed: false },
    thursday: { open: '08:00', close: '18:00', closed: false },
    friday: { open: '08:00', close: '18:00', closed: false },
    saturday: { open: '09:00', close: '17:00', closed: false },
    sunday: { open: '10:00', close: '16:00', closed: true }
};

const mergeOperatingHours = (incoming = {}) => {
    const merged = {};
    Object.entries(DEFAULT_OPERATING_HOURS).forEach(([day, defaults]) => {
        const source = incoming[day] || {};
        merged[day] = {
            open: typeof source.open === 'string' ? source.open : defaults.open,
            close: typeof source.close === 'string' ? source.close : defaults.close,
            closed: typeof source.closed === 'boolean' ? source.closed : defaults.closed
        };
    });
    return merged;
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

// Get all settings (Admin only)
router.get('/', verifyToken, requireAdmin, async(req, res) => {
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
router.get('/library', verifyToken, requireLibrarian, async(req, res) => {
    try {
        const settings = await req.dbAdapter.findInCollection('settings', { category: LIBRARY_CATEGORY });
        const index = settings.reduce((acc, setting) => {
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
            operatingHours: mergeOperatingHours(index.OPERATING_HOURS)
        };

        res.json(response);
    } catch (error) {
        console.error('Get library settings error:', error);
        res.status(500).json({ message: 'Failed to fetch library settings' });
    }
});

router.get('/borrowing-rules', verifyToken, requireLibrarian, async(req, res) => {
    try {
        const settings = await req.dbAdapter.findInCollection('settings', { category: LIBRARY_CATEGORY });
        const index = settings.reduce((acc, setting) => {
            acc[setting.id] = setting.value;
            return acc;
        }, {});

        const response = {
            maxBooksPerTransaction: toNumber(index.MAX_BOOKS_PER_TRANSACTION, 10),
            maxBorrowDays: toNumber(index.MAX_BORROW_DAYS, 14),
            maxRenewals: toNumber(index.MAX_RENEWALS, 2),
            finePerDay: toNumber(index.FINE_PER_DAY, 5),
            gracePeriodDays: toNumber(index.GRACE_PERIOD_DAYS, 0),
            maxFineAmount: toNumber(index.MAX_FINE_AMOUNT, 0),
            reservationPeriodDays: toNumber(index.RESERVATION_PERIOD_DAYS, 3),
            enableFines: toBoolean(index.ENABLE_FINES, true),
            annualBorrowingEnabled: toBoolean(index.ANNUAL_BORROWING_ENABLED, true),
            overnightBorrowingEnabled: toBoolean(index.OVERNIGHT_BORROWING_ENABLED, false),
            allowRenewalsWithOverdue: toBoolean(index.ALLOW_RENEWALS_WITH_OVERDUE, false)
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
                reservation: ''
            }
        };

        const value = setting?.value || {};
        const response = {
            ...defaults,
            ...value,
            emailTemplate: {
                ...defaults.emailTemplate,
                ...(value.emailTemplate || {})
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Get notifications settings error:', error);
        res.status(500).json({ message: 'Failed to fetch notifications settings' });
    }
});

router.get('/user-attributes', verifyToken, requireLibrarian, async(req, res) => {
    try {
        const [curriculaSetting, gradeLevelsSetting] = await Promise.all([
            req.dbAdapter.findOneInCollection('settings', { id: 'USER_CURRICULA' }),
            req.dbAdapter.findOneInCollection('settings', { id: 'USER_GRADE_LEVELS' })
        ]);

        const curriculumOptions = normalizeStringList(curriculaSetting?.value, DEFAULT_CURRICULA);
        const gradeLevels = normalizeStringList(gradeLevelsSetting?.value, DEFAULT_GRADE_LEVELS);

        res.json({
            curriculum: curriculumOptions,
            gradeLevels
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
            allowRegistration: toBoolean(index.ALLOW_REGISTRATION, true),
            requireEmailVerification: toBoolean(index.REQUIRE_EMAIL_VERIFICATION, true),
            sessionTimeoutMinutes: toNumber(index.SESSION_TIMEOUT_MINUTES, 60),
            maxLoginAttempts: toNumber(index.MAX_LOGIN_ATTEMPTS, 5),
            passwordPolicy: {
                minLength: toNumber(index.PASSWORD_MIN_LENGTH, 8),
                requireUppercase: toBoolean(index.PASSWORD_REQUIRE_UPPERCASE, true),
                requireLowercase: toBoolean(index.PASSWORD_REQUIRE_LOWERCASE, true),
                requireNumbers: toBoolean(index.PASSWORD_REQUIRE_NUMBERS, true),
                requireSpecialChars: toBoolean(index.PASSWORD_REQUIRE_SPECIAL_CHARS, false)
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

router.put('/library', verifyToken, requireAdmin, logAction('UPDATE', 'settings-library'), async(req, res) => {
    try {
        const {
            libraryName = '',
            libraryAddress = '',
            libraryPhone = '',
            libraryEmail = '',
            website = '',
            description = '',
            operatingHours
        } = req.body || {};

        const mergedHours = mergeOperatingHours(operatingHours);

        const updates = [
            { id: 'LIBRARY_NAME', value: libraryName, type: 'string' },
            { id: 'LIBRARY_ADDRESS', value: libraryAddress, type: 'string' },
            { id: 'LIBRARY_PHONE', value: libraryPhone, type: 'string' },
            { id: 'LIBRARY_EMAIL', value: libraryEmail, type: 'string' },
            { id: 'LIBRARY_WEBSITE', value: website, type: 'string' },
            { id: 'LIBRARY_DESCRIPTION', value: description, type: 'string' },
            { id: 'OPERATING_HOURS', value: mergedHours, type: 'object' }
        ];

        await Promise.all(
            updates.map((item) => updateOrCreateSetting(req.dbAdapter, req.user.id, item))
        );

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

router.put('/borrowing-rules', verifyToken, requireAdmin, logAction('UPDATE', 'settings-borrowing'), async(req, res) => {
    try {
        const {
            maxBooksPerTransaction,
            maxBorrowDays,
            maxRenewals,
            finePerDay,
            gracePeriodDays,
            maxFineAmount,
            reservationPeriodDays,
            enableFines,
            annualBorrowingEnabled,
            overnightBorrowingEnabled,
            allowRenewalsWithOverdue
        } = req.body || {};

        const updates = [
            { id: 'MAX_BOOKS_PER_TRANSACTION', value: toNumber(maxBooksPerTransaction, 0), type: 'number' },
            { id: 'MAX_BORROW_DAYS', value: toNumber(maxBorrowDays, 0), type: 'number' },
            { id: 'MAX_RENEWALS', value: toNumber(maxRenewals, 0), type: 'number' },
            { id: 'FINE_PER_DAY', value: toNumber(finePerDay, 0), type: 'number' },
            { id: 'GRACE_PERIOD_DAYS', value: toNumber(gracePeriodDays, 0), type: 'number' },
            { id: 'MAX_FINE_AMOUNT', value: toNumber(maxFineAmount, 0), type: 'number' },
            { id: 'RESERVATION_PERIOD_DAYS', value: toNumber(reservationPeriodDays, 0), type: 'number' },
            { id: 'ENABLE_FINES', value: toBoolean(enableFines, true), type: 'boolean' },
            { id: 'ANNUAL_BORROWING_ENABLED', value: toBoolean(annualBorrowingEnabled, true), type: 'boolean' },
            { id: 'OVERNIGHT_BORROWING_ENABLED', value: toBoolean(overnightBorrowingEnabled, false), type: 'boolean' },
            { id: 'ALLOW_RENEWALS_WITH_OVERDUE', value: toBoolean(allowRenewalsWithOverdue, false), type: 'boolean' }
        ];

        await Promise.all(
            updates.map((item) => updateOrCreateSetting(req.dbAdapter, req.user.id, item))
        );

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

router.put('/notifications', verifyToken, requireAdmin, logAction('UPDATE', 'settings-notifications'), async(req, res) => {
    try {
        const {
            emailNotifications = true,
            smsNotifications = false,
            dueDateReminders = true,
            overdueNotifications = true,
            reservationNotifications = true,
            reminderDaysBefore = 3,
            maxReminders = 3,
            emailTemplate = {}
        } = req.body || {};

        const normalized = {
            emailNotifications: toBoolean(emailNotifications, true),
            smsNotifications: toBoolean(smsNotifications, false),
            dueDateReminders: toBoolean(dueDateReminders, true),
            overdueNotifications: toBoolean(overdueNotifications, true),
            reservationNotifications: toBoolean(reservationNotifications, true),
            reminderDaysBefore: toNumber(reminderDaysBefore, 0),
            maxReminders: toNumber(maxReminders, 0),
            emailTemplate: {
                dueDate: emailTemplate.dueDate || '',
                overdue: emailTemplate.overdue || '',
                reservation: emailTemplate.reservation || ''
            }
        };

        await updateOrCreateSetting(req.dbAdapter, req.user.id, {
            id: 'NOTIFICATION_SETTINGS',
            value: normalized,
            type: 'object',
            category: NOTIFICATION_CATEGORY
        });

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

router.put('/user-attributes', verifyToken, requireAdmin, logAction('UPDATE', 'settings-user-attributes'), async(req, res) => {
    try {
        const {
            curriculum = [],
            gradeLevels = []
        } = req.body || {};

        const normalizedCurriculum = normalizeStringList(curriculum, DEFAULT_CURRICULA);
        const normalizedGradeLevels = normalizeStringList(gradeLevels, DEFAULT_GRADE_LEVELS);

        await Promise.all([
            updateOrCreateSetting(req.dbAdapter, req.user.id, {
                id: 'USER_CURRICULA',
                value: normalizedCurriculum,
                type: 'array',
                category: USER_CATEGORY,
                description: 'Configured curriculum options for users and students'
            }),
            updateOrCreateSetting(req.dbAdapter, req.user.id, {
                id: 'USER_GRADE_LEVELS',
                value: normalizedGradeLevels,
                type: 'array',
                category: USER_CATEGORY,
                description: 'Configured grade level options for users and students'
            })
        ]);

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

router.put('/system', verifyToken, requireAdmin, logAction('UPDATE', 'settings-system'), async(req, res) => {
    try {
        const {
            maintenanceMode,
            allowRegistration,
            requireEmailVerification,
            sessionTimeoutMinutes,
            maxLoginAttempts,
            passwordPolicy = {},
            backupFrequency,
            logRetentionDays,
            auditLogging
        } = req.body || {};

        const updates = [
            { id: 'MAINTENANCE_MODE', value: toBoolean(maintenanceMode, false), type: 'boolean', category: SYSTEM_CATEGORY },
            { id: 'ALLOW_REGISTRATION', value: toBoolean(allowRegistration, true), type: 'boolean', category: SYSTEM_CATEGORY },
            { id: 'REQUIRE_EMAIL_VERIFICATION', value: toBoolean(requireEmailVerification, true), type: 'boolean', category: SYSTEM_CATEGORY },
            { id: 'SESSION_TIMEOUT_MINUTES', value: toNumber(sessionTimeoutMinutes, 60), type: 'number', category: SYSTEM_CATEGORY },
            { id: 'MAX_LOGIN_ATTEMPTS', value: toNumber(maxLoginAttempts, 5), type: 'number', category: SYSTEM_CATEGORY },
            { id: 'BACKUP_FREQUENCY', value: backupFrequency || 'daily', type: 'string', category: SYSTEM_CATEGORY },
            { id: 'LOG_RETENTION_DAYS', value: toNumber(logRetentionDays, 90), type: 'number', category: SYSTEM_CATEGORY },
            { id: 'AUDIT_LOGGING_ENABLED', value: toBoolean(auditLogging, true), type: 'boolean', category: SYSTEM_CATEGORY }
        ];

        const normalizedPolicy = {
            minLength: toNumber(passwordPolicy.minLength, 8),
            requireUppercase: toBoolean(passwordPolicy.requireUppercase, true),
            requireLowercase: toBoolean(passwordPolicy.requireLowercase, true),
            requireNumbers: toBoolean(passwordPolicy.requireNumbers, true),
            requireSpecialChars: toBoolean(passwordPolicy.requireSpecialChars, false)
        };

        const policyUpdates = [
            { id: 'PASSWORD_MIN_LENGTH', value: normalizedPolicy.minLength, type: 'number', category: SYSTEM_CATEGORY },
            { id: 'PASSWORD_REQUIRE_UPPERCASE', value: normalizedPolicy.requireUppercase, type: 'boolean', category: SYSTEM_CATEGORY },
            { id: 'PASSWORD_REQUIRE_LOWERCASE', value: normalizedPolicy.requireLowercase, type: 'boolean', category: SYSTEM_CATEGORY },
            { id: 'PASSWORD_REQUIRE_NUMBERS', value: normalizedPolicy.requireNumbers, type: 'boolean', category: SYSTEM_CATEGORY },
            { id: 'PASSWORD_REQUIRE_SPECIAL_CHARS', value: normalizedPolicy.requireSpecialChars, type: 'boolean', category: SYSTEM_CATEGORY }
        ];

        await Promise.all(
            [...updates, ...policyUpdates].map((item) => updateOrCreateSetting(req.dbAdapter, req.user.id, item))
        );

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
router.put('/:key', verifyToken, requireAdmin, logAction('UPDATE', 'setting'), async(req, res) => {
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
router.post('/', verifyToken, requireAdmin, logAction('CREATE', 'setting'), async(req, res) => {
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
router.delete('/:key', verifyToken, requireAdmin, logAction('DELETE', 'setting'), async(req, res) => {
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
router.post('/reset/defaults', verifyToken, requireAdmin, logAction('RESET_DEFAULTS', 'setting'), async(req, res) => {
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
            { id: 'LIBRARY_NAME', value: 'ONHS Library', type: 'string', category: 'receipt', description: 'Library name for receipts' },
            { id: 'LIBRARY_ADDRESS', value: 'School Address', type: 'string', category: 'receipt', description: 'Library address for receipts' },
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

module.exports = router;