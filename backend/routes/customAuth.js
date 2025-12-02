const express = require('express');
const {
  verifyToken,
  logAction,
  generateToken,
  hashPassword,
  verifyPassword,
  recordAuditEvent,
  setAuditContext,
} = require('../middleware/customAuth');
const { getSettingsSnapshot } = require('../utils/settingsCache');
const router = express.Router();

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const mergePreferences = (base = {}, updates = {}) => {
  if (!isPlainObject(base)) base = {};
  if (!isPlainObject(updates)) return { ...base };

  const result = { ...base };
  for (const [key, value] of Object.entries(updates)) {
    if (isPlainObject(value)) {
      result[key] = mergePreferences(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const loadSystemSettings = async (req) => {
  try {
    const snapshot = await getSettingsSnapshot(req.dbAdapter);
    return snapshot.system || null;
  } catch (error) {
    console.error('Failed to load system settings:', error);
    return null;
  }
};

// Register a new user
router.post('/register', logAction('REGISTER', 'user'), async (req, res) => {
  try {
    const systemSettings = await loadSystemSettings(req);
    if (systemSettings?.maintenanceMode) {
      setAuditContext(req, {
        success: false,
        status: 'MaintenanceMode',
        description: 'Registration blocked during maintenance',
      });
      return res.status(503).json({ message: 'Registration is unavailable during maintenance' });
    }

    const { 
      username, 
      email, 
      password, 
      firstName, 
      lastName, 
      role = 'student', 
      curriculum, 
      gradeLevel 
    } = req.body;

    // Validate required fields
    if (!username || !email || !password || !firstName || !lastName) {
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: 'Registration failed: missing required fields',
        details: { username, email },
      });
      return res.status(400).json({ 
        message: 'Username, email, password, firstName, and lastName are required' 
      });
    }

    // Validate password length
    const minLength = systemSettings?.passwordMinLength || 8;
    if (password.length < minLength) {
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: `Registration failed: password too short (minimum ${minLength} characters)`,
      });
      return res.status(400).json({ message: `Password must be at least ${minLength} characters long` });
    }

    // Check if username already exists
    const existingUsers = await req.dbAdapter.getUsers({ username });
    if (existingUsers.length > 0) {
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: `Registration failed: username ${username} already exists`,
        details: { username },
      });
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Validate grade level if provided
    if (gradeLevel) {
      const gradeStructureSetting = await req.dbAdapter.findOneInCollection('settings', { id: 'USER_GRADE_STRUCTURE' });
      if (gradeStructureSetting && gradeStructureSetting.value) {
        const structure = gradeStructureSetting.value;
        if (!Array.isArray(structure) || !structure.some(entry => entry.grade === gradeLevel)) {
          setAuditContext(req, {
            success: false,
            status: 'Failed',
            description: 'Registration failed: invalid grade level',
            details: { gradeLevel },
          });
          return res.status(400).json({ message: 'Invalid grade level' });
        }
      }
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user document
    const userData = {
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
        role,
      curriculum: curriculum || null,
      gradeLevel: gradeLevel || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
      borrowingStats: {
        totalBorrowed: 0,
        currentlyBorrowed: 0,
        totalFines: 0,
        totalReturned: 0
      }
    };

    const newUser = await req.dbAdapter.createUser(userData);

    setAuditContext(req, {
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role,
        username: newUser.username,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
      },
      entityId: newUser._id,
      resourceId: newUser._id,
      description: `Registered new user ${newUser.username}`,
      details: {
        role: newUser.role,
  curriculum: newUser.curriculum || null,
        gradeLevel: newUser.gradeLevel || null,
      },
    });

    // Generate token
    const expiresIn = systemSettings?.sessionTimeoutMinutes ? `${systemSettings.sessionTimeoutMinutes}m` : JWT_EXPIRES_IN;
    const token = generateToken(newUser, expiresIn);

    // Remove password from response
    const { password: _, ...userResponse } = newUser;

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Registration error:', error);
    setAuditContext(req, {
      success: false,
      status: 'Failed',
      description: 'Registration failed due to server error',
      details: { error: error.message },
    });
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// Login with username or email  
router.post('/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      await recordAuditEvent(req, {
        action: 'LOGIN',
        entity: 'auth',
        success: false,
        statusCode: 400,
        description: 'Login failed: missing credentials',
        details: { usernameOrEmail: usernameOrEmail || null },
      });
      return res.status(400).json({ message: 'Username/email and password are required' });
    }

    let userData = null;

    // Check if it's a username (not an email)
    // Also append to debug file to capture logs from background server
    try {
      const fs = require('fs');
      const logLine = `${new Date().toISOString()}\tAUTH_DEBUG\tlookup\tusernameOrEmail=${usernameOrEmail}\tfound=${userData?userData.username:'none'}\tid=${userData?userData._id:'none'}\tpwdPrefix=${userData&&userData.password?String(userData.password).slice(0,6):'no-password'}\n`;
      fs.appendFileSync(require('path').join(__dirname, '../tmp_auth_debug.log'), logLine);
    } catch (e) {
      // ignore
    }
    if (!usernameOrEmail.includes('@')) {
      // Look up by username
      const users = await req.dbAdapter.getUsers({ username: usernameOrEmail });
      if (users.length === 0) {
        await recordAuditEvent(req, {
          action: 'LOGIN',
          entity: 'auth',
          success: false,
          statusCode: 404,
          description: `Login failed: user ${usernameOrEmail} not found`,
          details: { usernameOrEmail },
        });
        return res.status(404).json({ message: 'User not found' });
      }
      userData = users[0];
    } else {
      // Look up by email
      const users = await req.dbAdapter.getUsers({ email: usernameOrEmail });
      if (users.length === 0) {
        await recordAuditEvent(req, {
          action: 'LOGIN',
          entity: 'auth',
          success: false,
          statusCode: 404,
          description: `Login failed: user ${usernameOrEmail} not found`,
          details: { usernameOrEmail },
        });
        return res.status(404).json({ message: 'User not found' });
      }
      userData = users[0];
    }

    if (!userData.isActive) {
      await recordAuditEvent(req, {
        action: 'LOGIN',
        entity: 'auth',
        success: false,
        statusCode: 403,
        description: `Login failed: account ${userData.username} is deactivated`,
        user: userData,
      });
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    // Check if account is locked due to failed attempts
    if (userData.lockedUntil && userData.lockedUntil > new Date()) {
      await recordAuditEvent(req, {
        action: 'LOGIN',
        entity: 'auth',
        success: false,
        statusCode: 429,
        description: `Login failed: account ${userData.username} is locked`,
        user: userData,
      });
      return res.status(429).json({ message: 'Account locked due to too many failed attempts' });
    }

    const systemSettings = await loadSystemSettings(req);
    const isAdmin = (userData.role || '').toLowerCase() === 'admin';
    if (systemSettings?.maintenanceMode && !isAdmin) {
      await recordAuditEvent(req, {
        action: 'LOGIN',
        entity: 'auth',
        success: false,
        statusCode: 503,
        description: 'Login blocked: system in maintenance mode',
        user: userData,
      });
      return res.status(503).json({ message: 'System is currently in maintenance mode' });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, userData.password);
    if (!isPasswordValid) {
      // Increment failed attempts
      const maxAttempts = systemSettings?.maxLoginAttempts || 5;
      const currentAttempts = (userData.failedLoginAttempts || 0) + 1;
      const lockDurationMinutes = 15; // Lock for 15 minutes after max attempts
      let lockedUntil = null;
      if (currentAttempts >= maxAttempts) {
        lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);
      }
      await req.dbAdapter.updateUser(userData._id, {
        failedLoginAttempts: currentAttempts,
        lastFailedLoginAt: new Date(),
        lockedUntil
      });
      await recordAuditEvent(req, {
        action: 'LOGIN',
        entity: 'auth',
        success: false,
        statusCode: 401,
        description: `Login failed: invalid credentials for ${userData.username}`,
        user: userData,
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Email verification is no longer required for login

    // If the stored password was in plaintext (legacy), migrate it to a bcrypt hash now
    try {
      if (isPasswordValid && typeof userData.password === 'string' && !/^\$2[aby]\$/.test(userData.password)) {
        const bcrypt = require('bcrypt');
        const newHashed = await bcrypt.hash(password, 10);
        // update stored password to hashed value
        await req.dbAdapter.updateUser(userData._id, { password: newHashed, updatedAt: new Date() });
        // keep local copy consistent
        userData.password = newHashed;
      }
    } catch (migrateErr) {
      console.error('Password migration error for user', userData.username, migrateErr);
      // Do not fail login just because migration failed; proceed
    }

    // Update last login
    await req.dbAdapter.updateUser(userData._id, {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0, // Reset on successful login
      lockedUntil: null
    });

    // Generate token
    const expiresIn = systemSettings?.sessionTimeoutMinutes ? `${systemSettings.sessionTimeoutMinutes}m` : JWT_EXPIRES_IN;
    const token = generateToken(userData, expiresIn);

    // Remove password from response
    const { password: _, ...userResponse } = userData;
    const safeUser = {
      ...userResponse,
      preferences: userResponse.preferences && typeof userResponse.preferences === 'object'
        ? userResponse.preferences
        : {},
    };

    const responsePayload = {
      message: 'Login successful',
      token,
      user: safeUser
    };

    await recordAuditEvent(req, {
      action: 'LOGIN',
      entity: 'auth',
      success: true,
      statusCode: 200,
      description: `Login successful for ${userData.username}`,
      user: userData,
      details: {
        username: userData.username,
        role: userData.role,
        lastLoginAt: userData.lastLoginAt,
      },
    });

  res.json(responsePayload);

  } catch (error) {
    console.error('Login error:', error);
    await recordAuditEvent(req, {
      action: 'LOGIN',
      entity: 'auth',
      success: false,
      statusCode: 500,
      description: 'Login failed due to server error',
      details: { error: error.message },
    });
    res.status(500).json({ message: 'Login failed' });
  }
});

// Verify token (for frontend to check if token is still valid)
router.get('/verify', verifyToken, async (req, res) => {
  try {
    // Token is valid if we reach here (verifyToken middleware passed)
    const { password: _, ...userResponse } = req.user;
    const safeUser = {
      ...userResponse,
      preferences: userResponse.preferences && typeof userResponse.preferences === 'object'
        ? userResponse.preferences
        : {},
    };
    
    res.json({
      message: 'Token is valid',
      user: safeUser
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ message: 'Token verification failed' });
  }
});

// Change password
router.post('/change-password', verifyToken, logAction('CHANGE_PASSWORD', 'auth'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: 'Change password failed: missing required fields',
      });
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    // Validate new password length
    const systemSettings = await loadSystemSettings(req);
    const minLength = systemSettings?.passwordMinLength || 8;
    if (newPassword.length < minLength) {
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: `Change password failed: new password too short (minimum ${minLength} characters)`,
      });
      return res.status(400).json({ message: `New password must be at least ${minLength} characters long` });
    }

    // Get current user data
    const userData = await req.dbAdapter.findUserById(req.user.id);
    if (!userData) {
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: 'Change password failed: user not found',
      });
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, userData.password);
    if (!isCurrentPasswordValid) {
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: 'Change password failed: current password incorrect',
      });
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await req.dbAdapter.updateUser(req.user.id, {
      password: hashedNewPassword,
      updatedAt: new Date()
    });

    setAuditContext(req, {
      description: 'Password changed successfully',
    });

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    setAuditContext(req, {
      success: false,
      status: 'Failed',
      description: 'Change password failed due to server error',
      details: { error: error.message },
    });
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Logout (client-side token removal, server doesn't need to do anything)
router.post('/logout', verifyToken, async (req, res) => {
  await recordAuditEvent(req, {
    action: 'LOGOUT',
    entity: 'auth',
    success: true,
    statusCode: 200,
    description: 'User logged out',
    user: req.user,
  });
  res.json({ message: 'Logged out successfully' });
});

router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const preferences = isPlainObject(req.user.preferences)
      ? req.user.preferences
      : {};
    res.json({ preferences });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ message: 'Failed to fetch preferences' });
  }
});

router.put(
  '/preferences',
  verifyToken,
  logAction('UPDATE', 'preferences'),
  async (req, res) => {
    try {
      const incoming = req.body?.preferences;
      if (!isPlainObject(incoming)) {
        setAuditContext(req, {
          success: false,
          status: 'ValidationError',
          description: 'Invalid preferences payload',
        });
        return res.status(400).json({ message: 'Preferences object is required' });
      }

      const userId = req.user.id;
      const currentUser = await req.dbAdapter.findUserById(userId);
      if (!currentUser) {
        setAuditContext(req, {
          success: false,
          status: 'UserNotFound',
          description: 'Failed to update preferences: user not found',
        });
        return res.status(404).json({ message: 'User not found' });
      }

      const merged = mergePreferences(currentUser.preferences, incoming);
      const updatedUser = await req.dbAdapter.updateUser(userId, {
        preferences: merged,
        updatedAt: new Date(),
      });

      if (!updatedUser) {
        setAuditContext(req, {
          success: false,
          status: 'UpdateFailed',
          description: 'Failed to persist user preferences',
        });
        return res.status(500).json({ message: 'Failed to update preferences' });
      }

      req.user.preferences = merged;

      setAuditContext(req, {
        success: true,
        status: 'Updated',
        entityId: userId,
        description: 'Updated user preferences',
      });

      res.json({ message: 'Preferences updated', preferences: merged });
    } catch (error) {
      console.error('Update preferences error:', error);
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: 'Failed to update preferences',
        details: { error: error.message },
      });
      res.status(500).json({ message: 'Failed to update preferences' });
    }
  },
);

module.exports = router;