const SENSITIVE_FIELDS = [
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'idtoken',
  'authtoken',
  'accesstoken',
  'secret',
];

const toLower = (value) => String(value || '').toLowerCase();

const maskSensitive = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitive(item));
  }

  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach((key) => {
      const lowerKey = toLower(key);
      if (SENSITIVE_FIELDS.includes(lowerKey)) {
        result[key] = '[redacted]';
        return;
      }

      const nested = value[key];
      if (nested && typeof nested === 'object') {
        result[key] = maskSensitive(nested);
      } else {
        result[key] = nested;
      }
    });
    return result;
  }

  return value;
};

const extractIpAddress = (req) => {
  if (!req) {
    return null;
  }

  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    null
  );
};

const buildUserContext = (user) => {
  if (!user) {
    return null;
  }

  const id = user.id || user._id || user.userId || null;
  const email = user.email || user.userEmail || null;
  const role = user.role || user.userRole || null;
  const username = user.username || user.userName || null;
  const firstName = user.firstName || user.givenName || '';
  const lastName = user.lastName || user.familyName || '';
  const displayName = user.name || [firstName, lastName].filter(Boolean).join(' ') || username || email || null;

  return {
    id,
    email,
    role,
    username,
    name: displayName,
  };
};

const mergeAuditContext = (existing = {}, incoming = {}) => {
  const merged = { ...existing, ...incoming };

  if (existing.details || incoming.details) {
    merged.details = {
      ...(existing.details || {}),
      ...(incoming.details || {}),
    };
  }

  if (existing.metadata || incoming.metadata) {
    merged.metadata = {
      ...(existing.metadata || {}),
      ...(incoming.metadata || {}),
    };
  }

  return merged;
};

const setAuditContext = (req, context = {}) => {
  if (!req) {
    return;
  }

  req.auditContext = mergeAuditContext(req.auditContext, context);
  return req.auditContext;
};

const captureRequestSnapshot = (req) => {
  if (!req) {
    return undefined;
  }

  const snapshot = {
    method: req.method,
    url: req.originalUrl,
  };

  const queryKeys = req.query && Object.keys(req.query);
  if (queryKeys && queryKeys.length > 0) {
    snapshot.query = maskSensitive(req.query);
  }

  if (req.method !== 'GET') {
    const bodyKeys = req.body && Object.keys(req.body);
    if (bodyKeys && bodyKeys.length > 0) {
      snapshot.body = maskSensitive(req.body);
    }
  }

  return snapshot;
};

const recordAuditEvent = async (req, payload = {}) => {
  if (!req?.dbAdapter || typeof req.dbAdapter.createAuditLog !== 'function') {
    return null;
  }

  try {
    const normalizedUser = buildUserContext(
      payload.user ||
        payload.userContext ||
        (payload.userId
          ? {
              id: payload.userId,
              email: payload.userEmail,
              role: payload.userRole,
              username: payload.username,
              name: payload.userName,
            }
          : req.user),
    );

    const success = payload.success !== undefined ? Boolean(payload.success) : true;
    const statusCode = payload.statusCode ?? payload.metadata?.statusCode ?? null;
    const metadata = { ...(payload.metadata || {}) };

    if (payload.durationMs !== undefined) {
      metadata.durationMs = payload.durationMs;
    }

    const details = payload.details !== undefined
      ? maskSensitive(payload.details)
      : payload.includeRequest
        ? { request: captureRequestSnapshot(req) }
        : undefined;

    const record = {
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      action: String(payload.action || 'UNKNOWN').toUpperCase(),
      entity: payload.entity || payload.resource || 'system',
      entityId: payload.entityId || payload.resourceId || null,
      resource: payload.resource || payload.entity || null,
      resourceId: payload.resourceId || payload.entityId || null,
      description:
        payload.description ||
        payload.summary ||
        payload.message ||
        `${payload.action || 'UNKNOWN'} ${payload.entity || ''}`.trim(),
      details,
      metadata,
      status: payload.status || (success ? 'Success' : 'Failed'),
      statusCode,
      success,
      userId: payload.userId || normalizedUser?.id || null,
      userEmail: payload.userEmail || normalizedUser?.email || null,
      userRole: payload.userRole || normalizedUser?.role || null,
      userName: payload.userName || normalizedUser?.name || null,
      username: payload.username || normalizedUser?.username || null,
      ipAddress: payload.ipAddress || extractIpAddress(req),
      userAgent: payload.userAgent || req?.get?.('User-Agent'),
      requestMethod: payload.requestMethod || req?.method,
      requestPath: payload.requestPath || req?.originalUrl,
    };

    if (payload.context) {
      record.context = payload.context;
    }

    return await req.dbAdapter.createAuditLog(record);
  } catch (error) {
    console.error('Audit logging error:', error);
    return null;
  }
};

module.exports = {
  recordAuditEvent,
  setAuditContext,
  captureRequestSnapshot,
  maskSensitive,
};
