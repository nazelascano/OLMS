const jwt = require('jsonwebtoken');
const {
  recordAuditEvent,
  captureRequestSnapshot,
  setAuditContext,
} = require('../utils/auditLogger');
const { getSettingsSnapshot } = require('../utils/settingsCache');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const normalizeRole = (role) => (role ? String(role).toLowerCase() : '');
const isAdminUser = (user) => normalizeRole(user && user.role) === 'admin';

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

        req.user = {
          id: userData._id,
          email: userData.email,
          username: userData.username,
          role: userData.role || 'student',
          firstName: userData.firstName,
          lastName: userData.lastName,
          ...userData
        };

        await loadAndAttachSettingsSnapshot(req);
        return next();
      } catch (err) {
        console.error('Test auth bypass failed:', err);
        return res.status(500).json({ message: 'Test auth setup failed' });
      }
    }

    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user data using database adapter
    const userData = await req.dbAdapter.findUserById(decoded.userId);
    
    if (!userData) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!userData.isActive) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Update last activity using database adapter
    await req.dbAdapter.updateUser(userData._id, {
      lastActivityAt: new Date(),
      lastLoginAt: userData.lastLoginAt || new Date() // Keep original login time, update activity
    });

    // Attach user data to request
    const safePreferences = userData.preferences && typeof userData.preferences === 'object'
      ? userData.preferences
      : {};

    req.user = {
      ...userData,
      id: userData._id,
      email: userData.email,
      username: userData.username,
      role: userData.role,
      firstName: userData.firstName,
      lastName: userData.lastName,
      preferences: safePreferences,
    };

    const snapshot = await loadAndAttachSettingsSnapshot(req);
    if (snapshot && snapshot.system && snapshot.system.maintenanceMode && !isAdminUser(req.user)) {
      return res.status(503).json({ message: 'System is currently in maintenance mode' });
    }
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
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
  const normalizedRoles = Array.isArray(roles)
    ? roles.map(role => String(role).toLowerCase())
    : [String(roles).toLowerCase()];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRole = req.user.role ? String(req.user.role).toLowerCase() : '';

    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

// Helper function to generate JWT token
const generateToken = (user) => {
  const payload = {
    userId: user._id,
    email: user.email,
    username: user.username,
    role: user.role
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

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

module.exports = {
  verifyToken,
  requireRole,
  requireAdmin,
  requireLibrarian,
  requireStaff,
  logAction,
  generateToken,
  hashPassword,
  verifyPassword,
  recordAuditEvent,
  setAuditContext,
  JWT_SECRET
};