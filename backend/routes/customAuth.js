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
const router = express.Router();

// Register a new user
router.post('/register', logAction('REGISTER', 'user'), async (req, res) => {
  try {
    const { 
      username, 
      email, 
      password, 
      firstName, 
      lastName, 
      role = 'student', 
      studentNumber, 
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

    // Check if email already exists
    const existingEmails = await req.dbAdapter.getUsers({ email });
    if (existingEmails.length > 0) {
      setAuditContext(req, {
        success: false,
        status: 'Failed',
        description: `Registration failed: email ${email} already exists`,
        details: { email },
      });
      return res.status(400).json({ message: 'Email already exists' });
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
      studentNumber: studentNumber || null,
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
    const token = generateToken(newUser);

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

    // Verify password
    const isPasswordValid = await verifyPassword(password, userData.password);
    if (!isPasswordValid) {
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

    // Update last login
    await req.dbAdapter.updateUser(userData._id, {
      lastLoginAt: new Date()
    });

    // Generate token
    const token = generateToken(userData);

    // Remove password from response
    const { password: _, ...userResponse } = userData;

    const responsePayload = {
      message: 'Login successful',
      token,
      user: userResponse
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
    
    res.json({
      message: 'Token is valid',
      user: userResponse
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

module.exports = router;