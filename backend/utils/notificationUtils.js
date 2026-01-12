const normalizeRecipients = (recipients = []) => {
  const unique = new Set();
  const values = Array.isArray(recipients) ? recipients : [recipients];
  values
    .flat()
    .filter((value) => value !== undefined && value !== null)
    .forEach((value) => {
      const normalized = String(value).trim();
      if (normalized) {
        unique.add(normalized);
      }
    });
  return Array.from(unique);
};

const normalizeRoleKey = (role) => {
  if (!role && role !== 0) {
    return '';
  }
  const value = String(role).trim().toLowerCase();
  if (!value) {
    return '';
  }
  switch (value) {
    case 'super admin':
    case 'super-admin':
    case 'superadmin':
    case 'administrator':
      return 'admin';
    default:
      return value;
  }
};

const normalizeRoleList = (roles = []) => {
  if (!Array.isArray(roles)) {
    return normalizeRecipients([]);
  }
  return normalizeRecipients(
    roles
      .filter(Boolean)
      .map((role) => normalizeRoleKey(role))
  );
};

const buildBaseDocument = (payload = {}) => {
  const now = new Date();
  const document = {
    title: payload.title || 'Notification',
    message: payload.message || '',
    type: payload.type || 'info',
    severity: payload.severity || 'info',
    recipients: normalizeRecipients(payload.recipients || []),
    meta: typeof payload.meta === 'object' && payload.meta !== null ? payload.meta : {},
    createdAt: payload.createdAt instanceof Date ? payload.createdAt : now,
    updatedAt: payload.updatedAt instanceof Date ? payload.updatedAt : now,
    readBy: Array.isArray(payload.readBy) ? payload.readBy : [],
  };

  if (payload.transactionId) {
    document.transactionId = payload.transactionId;
  }
  if (payload.link) {
    document.link = payload.link;
  }
  if (payload.fingerprint) {
    document.fingerprint = payload.fingerprint;
  }
  if (payload.source) {
    document.source = payload.source;
  }
  if (typeof payload.archived === 'boolean') {
    document.archived = payload.archived;
  }

  return document;
};

const createNotification = async (dbAdapter, payload = {}) => {
  if (!dbAdapter || typeof dbAdapter.insertIntoCollection !== 'function') {
    return null;
  }
  const document = buildBaseDocument(payload);
  if (!Array.isArray(document.recipients) || document.recipients.length === 0) {
    return null;
  }
  return dbAdapter.insertIntoCollection('notifications', document);
};

const createRoleNotification = async (dbAdapter, roles = [], payload = {}) => {
  const recipients = normalizeRoleList(roles);
  if (recipients.length === 0) {
    return null;
  }
  return createNotification(dbAdapter, {
    ...payload,
    recipients,
  });
};

module.exports = {
  createNotification,
  createRoleNotification,
  normalizeRecipients,
};
