const jwt = require('jsonwebtoken');
const {
  recordAuditEvent,
  captureRequestSnapshot,
  setAuditContext,
} = require('../utils/auditLogger');
const { getSettingsSnapshot } = require('../utils/settingsCache');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const MAX_SESSION_TIMEOUT_MINUTES = parseInt(process.env.MAX_SESSION_TIMEOUT_MINUTES, 10) || 60 * 24 * 30; // 30 days cap
const SLIDING_SESSION_THRESHOLD_SECONDS = parseInt(process.env.SLIDING_SESSION_THRESHOLD_SECONDS, 10) || 300; // default refresh window 5 minutes
const MIN_REFRESH_THRESHOLD_SECONDS = parseInt(process.env.MIN_REFRESH_THRESHOLD_SECONDS, 10) || 60;
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'olms_session';
const AUTH_COOKIE_PATH = process.env.AUTH_COOKIE_PATH || '/';
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || '';
const AUTH_COOKIE_SAMESITE = process.env.AUTH_COOKIE_SAMESITE || 'lax';
const AUTH_COOKIE_SECURE = ((process.env.AUTH_COOKIE_SECURE || (process.env.NODE_ENV === 'production' ? 'true' : 'false')).toString().toLowerCase() === 'true');
const AUTH_COOKIE_MAX_AGE_SECONDS = parseInt(process.env.AUTH_COOKIE_MAX_AGE_SECONDS, 10) || 60 * 60 * 24 * 7;

const normalizeRole = (role) => {
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
const isAdminUser = (user) => normalizeRole(user && (user.role || user.roleLabel || user.roleOriginal)) === 'admin';

const buildRequestUser = (userData) => {
  if (!userData || typeof userData !== 'object') {
    return null;
  }

  const safePreferences = userData.preferences && typeof userData.preferences === 'object'
    ? userData.preferences
    : {};

  const normalizedRole = normalizeRole(userData.role);
  const resolvedRole = normalizedRole || (userData.role ? String(userData.role).trim().toLowerCase() : 'student');
  const roleLabel = userData.role || resolvedRole || 'student';

  return {
    ...userData,
    id: userData._id,
    email: userData.email,
    username: userData.username,
    role: resolvedRole,
    roleLabel,
    roleOriginal: userData.role,
    preferences: safePreferences,
  };
};

const resolveSessionExpiration = (systemSettings) => {
  const rawMinutes = Number(systemSettings?.sessionTimeoutMinutes);
  if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) {
    return JWT_EXPIRES_IN;
  }

  const boundedMinutes = Math.min(rawMinutes, MAX_SESSION_TIMEOUT_MINUTES);
  const seconds = Math.round(boundedMinutes * 60);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return JWT_EXPIRES_IN;
  }

  return seconds;
};

const getSessionTimeoutSeconds = (systemSettings) => {
  const expiresIn = resolveSessionExpiration(systemSettings);
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    return expiresIn;
  }
  const minutes = Number(systemSettings?.sessionTimeoutMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return Math.round(Math.min(minutes, MAX_SESSION_TIMEOUT_MINUTES) * 60);
};

const getCookieMaxAgeSeconds = (systemSettings) => {
  const sessionSeconds = getSessionTimeoutSeconds(systemSettings);
  if (Number.isFinite(sessionSeconds) && sessionSeconds > 0) {
    return sessionSeconds;
  }
  return AUTH_COOKIE_MAX_AGE_SECONDS;
};

const buildCookieOptions = (maxAgeSeconds) => {
  const options = {
    httpOnly: true,
    secure: AUTH_COOKIE_SECURE,
    sameSite: AUTH_COOKIE_SAMESITE,
    path: AUTH_COOKIE_PATH,
  };
  if (AUTH_COOKIE_DOMAIN) {
    options.domain = AUTH_COOKIE_DOMAIN;
  }
  if (Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0) {
    options.maxAge = maxAgeSeconds * 1000;
  }
  return options;
};

const setSessionCookie = (res, token, maxAgeSeconds = AUTH_COOKIE_MAX_AGE_SECONDS) => {
  if (!res || typeof res.cookie !== 'function' || !token) {
    return;
  }
  res.cookie(AUTH_COOKIE_NAME, token, buildCookieOptions(maxAgeSeconds));
};

const clearSessionCookie = (res) => {
  if (!res || typeof res.clearCookie !== 'function') {
    return;
  }
  const options = buildCookieOptions();
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
};

const deriveSlidingThresholdSeconds = (sessionSeconds) => {
  if (!Number.isFinite(sessionSeconds) || sessionSeconds <= 0) {
    return Math.max(SLIDING_SESSION_THRESHOLD_SECONDS, MIN_REFRESH_THRESHOLD_SECONDS);
  }

  const ratioThreshold = Math.floor(sessionSeconds * 0.5); // refresh once half the lifetime elapsed
  const upperBound = Math.max(sessionSeconds - MIN_REFRESH_THRESHOLD_SECONDS, MIN_REFRESH_THRESHOLD_SECONDS);
  const desired = Math.max(ratioThreshold, SLIDING_SESSION_THRESHOLD_SECONDS, MIN_REFRESH_THRESHOLD_SECONDS);
  return Math.min(desired, upperBound);
};

const shouldRefreshToken = (decoded, thresholdSeconds = SLIDING_SESSION_THRESHOLD_SECONDS) => {
  if (!decoded || !Number.isFinite(decoded.exp)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  const timeLeft = decoded.exp - now;
  return Number.isFinite(timeLeft) && timeLeft > 0 && timeLeft <= thresholdSeconds;
};

const maybeRefreshSessionToken = async (req, res, user, decoded, snapshot) => {
  if (!res || typeof res.setHeader !== 'function') {
    return;
  }

  try {
    const systemSettings = snapshot?.system || req.systemSettings;
    const sessionSeconds = getSessionTimeoutSeconds(systemSettings);
    const refreshThreshold = deriveSlidingThresholdSeconds(sessionSeconds);
    if (!shouldRefreshToken(decoded, refreshThreshold)) {
      return;
    }
    const expiresIn = resolveSessionExpiration(systemSettings);
    const tokenSubject = user && user.roleOriginal
      ? { ...user, role: user.roleOriginal }
      : user;
    const refreshedToken = generateToken(tokenSubject, expiresIn);
    res.setHeader('x-session-refresh', refreshedToken);
    res.setHeader('x-session-refresh-lifetime', String(expiresIn));
    const cookieMaxAge = getCookieMaxAgeSeconds(systemSettings);
    setSessionCookie(res, refreshedToken, cookieMaxAge);
  } catch (error) {
    console.warn('Session refresh failed:', error?.message || error);
  }
};

const loadAndAttachSettingsSnapshot = async (req) => {
  if (!req || !req.dbAdapter || typeof req.dbAdapter.findInCollection !== 'function') {
    return null;
  }

  try {
    const snapshot = await getSettingsSnapshot(req.dbAdapter);
    req.settingsSnapshot = snapshot;
    req.systemSettings = snapshot.system;
    return snapshot;
  } catch (error) {
    console.error('Settings snapshot load error:', error);
    return null;
  }
};

// Middleware to verify JWT token and get user data from MongoDB
const verifyToken = async (req, res, next) => {
  try {
    // Allow tests or debug runs to bypass authentication by setting NODE_ENV=test
    // or DISABLE_AUTH=true. In that case attach the first available user from the DB
    // as req.user so protected endpoints can be exercised in tests.
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_AUTH === 'true') {
      try {
        const users = await req.dbAdapter.findInCollection('users', {});
        const userData = (users && users.length > 0) ? users[0] : null;
        if (!userData) {
          return res.status(500).json({ message: 'No users available for test auth' });
        }

        const decoratedUser = buildRequestUser(userData);
        if (!decoratedUser) {
          return res.status(500).json({ message: 'Failed to decorate user payload for test auth' });
        }

        req.user = decoratedUser;

        await loadAndAttachSettingsSnapshot(req);
        return next();
      } catch (err) {
        console.error('Test auth bypass failed:', err);
        return res.status(500).json({ message: 'Test auth setup failed' });
      }
    }

    const headerToken = req.headers.authorization?.split(' ')[1];
    const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];

    const respondToJwtError = (jwtError) => {
      clearSessionCookie(res);
      if (jwtError.message === 'No token provided') {
        return res.status(401).json({ message: 'No token provided' });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      return res.status(401).json({ message: 'Authentication failed' });
    };

    if (!headerToken && !cookieToken) {
      const missingTokenError = new Error('No token provided');
      missingTokenError.name = 'JsonWebTokenError';
      return respondToJwtError(missingTokenError);
    }

    const verifyJwt = (candidate) => {
      if (!candidate) {
        const error = new Error('Missing token');
        error.name = 'JsonWebTokenError';
        throw error;
      }
      return jwt.verify(candidate, JWT_SECRET);
    };

    let token = headerToken || cookieToken;
    let decoded;

    try {
      decoded = verifyJwt(token);
    } catch (primaryError) {
      if (headerToken && cookieToken && cookieToken !== headerToken) {
        try {
          decoded = verifyJwt(cookieToken);
          token = cookieToken;
          console.info('Auth token fallback: header token rejected, cookie token accepted for user session');
        } catch (cookieError) {
          return respondToJwtError(cookieError);
        }
      } else {
        return respondToJwtError(primaryError);
      }
    }
    
    // Get user data using database adapter
    const userData = await req.dbAdapter.findUserById(decoded.userId);
    
    if (!userData) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'User not found' });
    }

    if (!userData.isActive) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Update last activity using database adapter; do not fail auth if this write encounters issues
    try {
      await req.dbAdapter.updateUser(userData._id, {
        lastActivityAt: new Date(),
        lastLoginAt: userData.lastLoginAt || new Date(), // Keep original login time, update activity
      });
    } catch (activityError) {
      console.warn('Failed to record user activity:', activityError?.message || activityError);
    }

    const decoratedUser = buildRequestUser(userData);
    if (!decoratedUser) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Authentication failed' });
    }

    req.user = decoratedUser;

    const snapshot = await loadAndAttachSettingsSnapshot(req);
    if (snapshot && snapshot.system && snapshot.system.maintenanceMode && !isAdminUser(req.user)) {
      return res.status(503).json({ message: 'System is currently in maintenance mode' });
    }

    await maybeRefreshSessionToken(req, res, req.user, decoded, snapshot);

    const refreshHeaderAlreadySet = typeof res.getHeader === 'function' ? res.getHeader('x-session-refresh') : undefined;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!refreshHeaderAlreadySet && token && !headerToken) {
      try {
        res.setHeader('x-session-refresh', token);
        if (decoded?.exp) {
          const lifetime = Math.max(decoded.exp - nowSeconds, 0);
          res.setHeader('x-session-refresh-lifetime', String(lifetime));
        }
      } catch (headerError) {
        console.warn('Failed to mirror cookie session token in headers:', headerError?.message || headerError);
      }
    }
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    clearSessionCookie(res);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Middleware to check user roles
const requireRole = (roles) => {
  const entries = Array.isArray(roles) ? roles : [roles];
  const normalizedRoles = entries
    .map((role) => normalizeRole(role))
    .filter(Boolean);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRole = normalizeRole(req.user.role || req.user.roleLabel || req.user.roleOriginal);

    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

// Helper function to generate JWT token
function generateToken(user, expiresIn = JWT_EXPIRES_IN) {
  const payload = {
    userId: user._id,
    email: user.email,
    username: user.username,
    role: user.role
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// Helper function to hash password (simplified for testing)
const hashPassword = async (password) => {
  const bcrypt = require('bcrypt');
  // Use bcrypt with a reasonable cost factor
  const SALT_ROUNDS = 10;
  return await bcrypt.hash(password, SALT_ROUNDS);
};

// Helper function to verify password using bcrypt
const verifyPassword = async (password, storedPassword) => {
  try {
    const bcrypt = require('bcrypt');
    if (!storedPassword) return false;

    // Detect bcrypt hash prefix ($2a$, $2b$, $2y$). If it's a bcrypt hash, use bcrypt.compare.
    if (typeof storedPassword === 'string' && /^\$2[aby]\$/.test(storedPassword)) {
      return await bcrypt.compare(password, storedPassword);
    }

    // Fallback: stored password appears to be plaintext (legacy). Compare directly.
    // This keeps compatibility with older records until they are migrated to hashed values.
    return password === storedPassword;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
};

// Audit logging middleware
const logAction = (action, entity, options = {}) => {
  return (req, res, next) => {
    const startedAt = Date.now();

    res.once('finish', async() => {
      try {
        const context = req.auditContext || {};
        const success = context.success !== undefined ? Boolean(context.success) : res.statusCode < 400;

        const metadata = {
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          ...(options.metadata || {}),
          ...(context.metadata || {}),
        };

        const details = context.details !== undefined
          ? context.details
          : options.includeRequest === false
            ? undefined
            : { request: captureRequestSnapshot(req) };

        const description =
          context.description ||
          options.description ||
          (success
            ? `${action} ${entity}`
            : `${action} ${entity} failed (status ${res.statusCode})`);

        await recordAuditEvent(req, {
          action: context.action || action,
          entity: context.entity || entity,
          entityId:
            context.entityId ??
            context.resourceId ??
            options.entityId ??
            req.params?.id ??
            req.body?.id ??
            req.body?._id ??
            null,
          resource: context.resource || context.entity || entity,
          resourceId:
            context.resourceId ??
            context.entityId ??
            options.entityId ??
            req.params?.id ??
            req.body?.id ??
            req.body?._id ??
            null,
          description,
          details,
          metadata,
          success,
          status: context.status,
          statusCode: res.statusCode,
          user: context.user || req.user,
          userId: context.userId,
          userEmail: context.userEmail,
          userRole: context.userRole,
          userName: context.userName,
          username: context.username,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      } catch (error) {
        console.error('Audit logging error:', error);
      }
    });

    next();
  };
};

// Predefined role checks
const requireAdmin = requireRole(['admin']);
const requireLibrarian = requireRole(['admin', 'librarian']);
const requireStaff = requireRole(['admin', 'librarian', 'staff']);
const requireCirculation = requireRole(['admin', 'librarian', 'staff']);

module.exports = {
  verifyToken,
  requireRole,
  requireAdmin,
  requireLibrarian,
  requireStaff,
  requireCirculation,
  logAction,
  generateToken,
  hashPassword,
  verifyPassword,
  recordAuditEvent,
  setAuditContext,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  resolveSessionExpiration,
  getSessionTimeoutSeconds,
  setSessionCookie,
  clearSessionCookie,
  getCookieMaxAgeSeconds,
  normalizeRole,
  AUTH_COOKIE_NAME,
};