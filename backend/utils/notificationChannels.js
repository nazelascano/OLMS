const { getSettingsSnapshot, NOTIFICATION_DEFAULTS, getNotificationChannelState } = require('./settingsCache');
const { createNotification, createRoleNotification } = require('./notificationUtils');

const NOTIFICATION_CONTEXT_KEY = Symbol('notificationContext');

const buildChannelContext = (settings = NOTIFICATION_DEFAULTS) => {
    const normalized = settings || NOTIFICATION_DEFAULTS;
    return {
        settings: normalized,
        channelState: getNotificationChannelState(normalized)
    };
};

const ensureNotificationContext = async (req) => {
    if (!req) {
        return buildChannelContext(NOTIFICATION_DEFAULTS);
    }

    if (req[NOTIFICATION_CONTEXT_KEY]) {
        return req[NOTIFICATION_CONTEXT_KEY];
    }

    let context;
    try {
        const snapshot = await getSettingsSnapshot(req.dbAdapter);
        const notificationSettings = snapshot?.notifications || NOTIFICATION_DEFAULTS;
        context = buildChannelContext(notificationSettings);
    } catch (error) {
        console.error('Notification context load error:', error.message || error);
        context = buildChannelContext(NOTIFICATION_DEFAULTS);
    }

    Object.defineProperty(req, NOTIFICATION_CONTEXT_KEY, {
        value: context,
        enumerable: false,
        configurable: true,
        writable: false
    });

    return context;
};

const notifyRoles = async (req, roles = [], payload = {}) => {
    const normalizedRoles = Array.isArray(roles)
        ? roles.map(role => String(role).trim()).filter(Boolean)
        : [];

    if (normalizedRoles.length === 0) {
        return null;
    }

    const context = await ensureNotificationContext(req);
    if (!context.channelState.hasActiveChannel) {
        return null;
    }

    return createRoleNotification(req.dbAdapter, normalizedRoles, payload);
};

const notifyRecipients = async (req, recipients = [], payload = {}) => {
    const normalizedRecipients = Array.isArray(recipients)
        ? recipients.map(value => String(value).trim()).filter(Boolean)
        : [];

    if (normalizedRecipients.length === 0) {
        return null;
    }

    const context = await ensureNotificationContext(req);
    if (!context.channelState.hasActiveChannel) {
        return null;
    }

    return createNotification(req.dbAdapter, {
        ...payload,
        recipients: normalizedRecipients
    });
};

const formatUserName = (subject = {}) => {
    if (!subject || typeof subject !== 'object') {
        return 'User';
    }
    if (subject.fullName && typeof subject.fullName === 'string' && subject.fullName.trim()) {
        return subject.fullName.trim();
    }
    const parts = [subject.firstName, subject.middleName, subject.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
    if (parts) {
        return parts;
    }
    return subject.username || subject.email || 'User';
};

module.exports = {
    ensureNotificationContext,
    notifyRoles,
    notifyRecipients,
    formatUserName
};
