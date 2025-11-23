const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, requireRole, requireAdmin, requireLibrarian, requireStaff, logAction, setAuditContext } = require('../middleware/customAuth');
const router = express.Router();

const DEFAULT_SYSTEM_ROLES = ['admin', 'librarian', 'staff', 'student'];

const AVATAR_STORAGE_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const ALLOWED_AVATAR_MIME_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
};
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ensureDirectory = async(dirPath) => {
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
};

const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        ensureDirectory(AVATAR_STORAGE_DIR)
            .then(() => cb(null, AVATAR_STORAGE_DIR))
            .catch((error) => cb(error));
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const randomSuffix = Math.round(Math.random() * 1e9);
        const extensionFromMime = ALLOWED_AVATAR_MIME_TYPES[file.mimetype];
        const extensionFromName = path.extname(file.originalname || '').toLowerCase();
        const allowedExtensions = new Set(Object.values(ALLOWED_AVATAR_MIME_TYPES));
        const resolvedExtension = extensionFromMime || (allowedExtensions.has(extensionFromName) ? extensionFromName : '.jpg');
        cb(null, `avatar-${timestamp}-${randomSuffix}${resolvedExtension}`);
    }
});

const avatarFileFilter = (req, file, cb) => {
    if (ALLOWED_AVATAR_MIME_TYPES[file.mimetype]) {
        return cb(null, true);
    }
    return cb(new Error('Unsupported file type. Please upload a JPG, PNG, GIF, or WEBP image.'));
};

const avatarUpload = multer({
    storage: avatarStorage,
    fileFilter: avatarFileFilter,
    limits: {
        fileSize: MAX_AVATAR_SIZE_BYTES
    }
});

const removeFileQuietly = async(filePath) => {
    if (!filePath) {
        return;
    }

    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`Failed to remove file ${filePath}:`, error.message);
        }
    }
};

const resolveAvatarFields = (user) => {
    if (!user || typeof user !== 'object') {
        return { avatar: null, avatarUrl: '' };
    }

    const avatarObject = user.avatar && typeof user.avatar === 'object' ? user.avatar : null;
    const url = user.avatarUrl || (avatarObject && avatarObject.url) || '';

    return {
        avatar: avatarObject || (url ? { url } : null),
        avatarUrl: url
    };
};

// Utility: normalize string for comparison
const normalizeString = (value) => {
    if (!value) return '';
    return String(value).toLowerCase();
};

const matchesSearchTerm = (user, term) => {
    if (!term) return true;
    const searchTerm = normalizeString(term);
    const fieldsToSearch = [
        user.firstName,
        user.lastName,
        user.middleName,
        user.username,
        user.email,
        user.studentNumber,
        user.studentId,
        user.libraryCardNumber,
    user?.library?.cardNumber,
    user.curriculum,
        user.gradeLevel,
    ];

    return fieldsToSearch.some((field) => normalizeString(field).includes(searchTerm));
};

const getUserIdentifiers = (user) => {
    const identifiers = new Set();
    [
        user?._id,
        user?.id,
        user?.userId,
        user?.libraryCardNumber,
        user?.library?.cardNumber,
        user?.studentId,
        user?.studentNumber,
        user?.username,
        user?.email,
    ]
        .filter(Boolean)
        .forEach((value) => identifiers.add(String(value)));
    return identifiers;
};

const sanitizeUserSummary = (user) => {
    const primaryId = user.id || user._id;
    if (!primaryId) {
        return null;
    }

    const { avatar, avatarUrl } = resolveAvatarFields(user);

    return {
        id: String(primaryId),
        _id: user._id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        middleName: user.middleName || '',
        username: user.username || '',
        email: user.email || '',
        role: user.role || 'student',
    // normalize: provide both studentId and studentNumber for client compatibility
    studentId: user.studentId || user.studentNumber || '',
    studentNumber: user.studentNumber || user.studentId || (user.library && user.library.cardNumber) || user.libraryCardNumber || '',
    curriculum: user.curriculum || '',
        gradeLevel: user.gradeLevel || user.grade || '',
        libraryCardNumber: user.library?.cardNumber || user.libraryCardNumber || '',
        avatar,
        avatarUrl,
    };
};

// Fetch distinct roles from database users (Admin, Librarian, Staff only)
router.get('/roles', verifyToken, requireStaff, async (req, res) => {
    try {
        const users = await req.dbAdapter.findInCollection('users', {});
        const roleSet = new Set();

        users.forEach((user) => {
            const rawRole = user?.role;
            if (!rawRole) {
                return;
            }
            const normalized = String(rawRole).trim().toLowerCase();
            if (normalized) {
                roleSet.add(normalized);
            }
        });

        if (roleSet.size === 0) {
            DEFAULT_SYSTEM_ROLES.forEach((role) => roleSet.add(role));
        }

        const roles = Array.from(roleSet).sort((a, b) => a.localeCompare(b));
        res.json({ roles });
    } catch (error) {
        console.error('Failed to load user roles:', error);
        res.status(500).json({ message: 'Failed to load user roles' });
    }
});

// Search users (Admin, Librarian, Staff only)
router.get('/search', verifyToken, requireStaff, async(req, res) => {
    try {
        const {
            q = '',
                role,
                limit = 20
        } = req.query;

        const searchTerm = String(q || '').trim();
        if (!searchTerm) {
            return res.json([]);
        }

        const filters = {};
        if (role) {
            filters.role = role;
        }

        const users = await req.dbAdapter.findInCollection('users', filters);
        const results = users
            .filter((user) => matchesSearchTerm(user, searchTerm))
            .sort((a, b) => {
                const dateA = new Date(a.updatedAt || a.createdAt || 0);
                const dateB = new Date(b.updatedAt || b.createdAt || 0);
                return dateB - dateA;
            })
            .slice(0, Math.max(parseInt(limit, 10) || 20, 1))
            .map(sanitizeUserSummary)
            .filter(Boolean);

        res.json(results);
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ message: 'Failed to search users' });
    }
});

// Get user borrowing status (Admin, Librarian, Staff only)
router.get('/:id/borrowing-status', verifyToken, requireStaff, async(req, res) => {
    try {
        const rawId = String(req.params.id);
        let user = await req.dbAdapter.findUserById(rawId);
        if (!user) {
            user = await req.dbAdapter.findOneInCollection('users', { id: rawId });
        }
        if (!user) {
            user = await req.dbAdapter.findOneInCollection('users', { username: rawId });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const identifiers = getUserIdentifiers(user);
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const now = new Date();
        let activeBorrowings = 0;
        let overdueBooks = 0;

        const relevantTransactions = transactions.filter(transaction => {
            const transactionUserId = String(transaction.userId || '');
            return identifiers.has(transactionUserId);
        });

        relevantTransactions.forEach(transaction => {
            const transactionStatus = transaction.status || 'pending';
            const items = Array.isArray(transaction.items) ? transaction.items : [];
            const dueDate = transaction.dueDate ? new Date(transaction.dueDate) : null;
            const isTransactionActive = ['borrowed', 'active'].includes(transactionStatus);

            if (items.length === 0 && isTransactionActive) {
                activeBorrowings += 1;
                if (dueDate && dueDate < now) {
                    overdueBooks += 1;
                }
                return;
            }

            items.forEach(item => {
                const itemStatus = item.status || transactionStatus;
                if (['borrowed', 'active'].includes(itemStatus)) {
                    activeBorrowings += 1;
                    if (dueDate && dueDate < now) {
                        overdueBooks += 1;
                    }
                }
            });
        });

        const borrowingStats = user.borrowingStats || {};
        const resolvedActiveBorrowings = Math.max(activeBorrowings, borrowingStats.currentlyBorrowed || 0);

        res.json({
            userId: String(user._id || user.id),
            activeBorrowings: resolvedActiveBorrowings,
            overdueBooks,
            totalBorrowed: borrowingStats.totalBorrowed || relevantTransactions.length,
            currentlyBorrowed: resolvedActiveBorrowings,
            totalReturned: borrowingStats.totalReturned || 0,
            totalFines: borrowingStats.totalFines || 0,
            borrowingLimit: user.library?.borrowingLimit || 5,
            fineBalance: user.library?.fineBalance || 0,
        });
    } catch (error) {
        console.error('Get borrowing status error:', error);
        res.status(500).json({ message: 'Failed to fetch borrowing status' });
    }
});

// Get all users (Admin, Librarian, Staff only)
router.get('/', verifyToken, requireStaff, async(req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            role,
            curriculum,
            gradeLevel,
            isActive,
            search
        } = req.query;

        // Build query filters
        let filters = {};
    if (role) filters.role = role;
    if (curriculum) filters.curriculum = curriculum;
        if (gradeLevel) filters.gradeLevel = gradeLevel;
        if (isActive !== undefined) filters.isActive = isActive === 'true';

        // Get all users matching filters
        let users = await req.dbAdapter.findInCollection('users', filters);

        // Apply search filter
        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(user =>
                user.firstName ?.toLowerCase().includes(searchLower) ||
                user.lastName ?.toLowerCase().includes(searchLower) ||
                user.email ?.toLowerCase().includes(searchLower) ||
                user.username ?.toLowerCase().includes(searchLower) ||
                user.studentNumber ?.toLowerCase().includes(searchLower)
            );
        }

        // Sort by createdAt descending
        users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Apply pagination
    const total = users.length;
    const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
    const limitString = typeof limit === 'string' ? limit.toLowerCase() : limit;
    const wantsAll = limitString === 'all' || parseInt(limit, 10) === -1;
    const resolvedLimit = wantsAll ? total : Math.max(parseInt(limit, 10) || 20, 1);
    const skip = wantsAll ? 0 : (normalizedPage - 1) * resolvedLimit;
    const paginatedUsers = wantsAll ? users : users.slice(skip, skip + resolvedLimit);

        // Remove password field from response
        const safeUsers = paginatedUsers.map(user => {
            const { password, ...safeUser } = user;
            const { avatar, avatarUrl } = resolveAvatarFields(safeUser);
            // ensure normalized studentNumber exists for clients
            return {
                ...safeUser,
                avatar,
                avatarUrl,
                studentNumber: safeUser.studentNumber || safeUser.studentId || (safeUser.library && safeUser.library.cardNumber) || safeUser.libraryCardNumber || ''
            };
        });

        res.json({
            users: safeUsers,
            pagination: {
                page: normalizedPage,
                limit: resolvedLimit,
                total,
                pages: wantsAll ? (total > 0 ? 1 : 0) : Math.ceil(total / resolvedLimit),
                mode: wantsAll ? 'all' : 'paged'
            },
            total
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Failed to fetch users' });
    }
});

// Get current user profile stats (avoid matching /:id)
router.get('/profile/stats', verifyToken, async(req, res) => {
    try {
        const userId = req.user.id;
        const transactions = await req.dbAdapter.findInCollection('transactions', { userId });

        const stats = {
            totalBorrowings: transactions.length,
            activeBorrowings: transactions.filter(t => t.status === 'borrowed').length,
            overdueBorrowings: transactions.filter(t => t.status === 'borrowed' && new Date(t.dueDate) < new Date()).length,
            totalFines: transactions.reduce((sum, t) => sum + (t.fine || 0), 0)
        };

        res.json(stats);
    } catch (error) {
        console.error('Get profile stats error:', error);
        res.status(500).json({ message: 'Failed to fetch profile stats' });
    }
});

// Get current user borrowing history
router.get('/profile/borrowing-history', verifyToken, async(req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10 } = req.query;

        let transactions = await req.dbAdapter.findInCollection('transactions', { userId });
        transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Return array directly for frontend compatibility
        res.json(transactions);
    } catch (error) {
        console.error('Get borrowing history error:', error);
        res.status(500).json({ message: 'Failed to fetch borrowing history' });
    }
});

// Get user by ID
router.get('/:id', verifyToken, requireStaff, async(req, res) => {
    try {
        const user = await req.dbAdapter.findUserById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Remove password from response
        const { password, ...safeUser } = user;

        // normalize studentNumber for client compatibility
        const { avatar, avatarUrl } = resolveAvatarFields(safeUser);

        const normalized = {
            ...safeUser,
            avatar,
            avatarUrl,
            studentNumber: safeUser.studentNumber || safeUser.studentId || (safeUser.library && safeUser.library.cardNumber) || safeUser.libraryCardNumber || ''
        };

        res.json(normalized);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Failed to fetch user' });
    }
});

// Create new user (Admin, Librarian only)
router.post('/', verifyToken, requireLibrarian, logAction('CREATE', 'user'), async(req, res) => {
    try {
        const {
            username,
            email: rawEmail,
            password,
            firstName,
            lastName,
            role,
            studentNumber,
            curriculum,
            gradeLevel
        } = req.body;

        const trimmedEmail = typeof rawEmail === 'string' ? rawEmail.trim() : '';
        const normalizedRoleInput = typeof role === 'string' ? role.trim() : role;
        const resolvedRole = normalizedRoleInput || 'student';

        setAuditContext(req, {
            metadata: {
                createRequest: {
                    username: username || null,
                    email: trimmedEmail || null,
                    role: resolvedRole || null
                }
            },
            details: {
                userDraft: {
                    username: username || null,
                    email: trimmedEmail || null,
                    firstName: firstName || null,
                    lastName: lastName || null,
                    role: resolvedRole || null,
                    studentNumber: studentNumber || null,
                    curriculum: curriculum || null,
                    gradeLevel: gradeLevel || null
                }
            }
        });

        // Validate required fields
        const missingFields = [];
        if (!username || !String(username).trim()) missingFields.push('username');
        if (!password) missingFields.push('password');
        if (!firstName || !String(firstName).trim()) missingFields.push('firstName');
        if (!lastName || !String(lastName).trim()) missingFields.push('lastName');

        if (missingFields.length > 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'User creation missing required fields',
                metadata: { missingFields }
            });
            return res.status(400).json({ message: `Missing required fields: ${missingFields.join(', ')}` });
        }

        // Validate password length
        if (password.length < 6) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'User creation failed due to short password',
                metadata: {
                    passwordLength: password.length
                }
            });
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // Check if username already exists
        const existingUsers = await req.dbAdapter.findInCollection('users', { username });
        if (existingUsers.length > 0) {
            setAuditContext(req, {
                success: false,
                status: 'Conflict',
                description: `User creation failed: username ${username} already exists`,
                metadata: {
                    username
                }
            });
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Validate email format and uniqueness when provided
        if (trimmedEmail) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(trimmedEmail)) {
                setAuditContext(req, {
                    success: false,
                    status: 'ValidationError',
                    description: 'User creation failed due to invalid email format',
                    metadata: { email: trimmedEmail }
                });
                return res.status(400).json({ message: 'Invalid email address' });
            }

            const existingEmails = await req.dbAdapter.findInCollection('users', { email: trimmedEmail });
            if (existingEmails.length > 0) {
                setAuditContext(req, {
                    success: false,
                    status: 'Conflict',
                    description: `User creation failed: email ${trimmedEmail} already exists`,
                    metadata: {
                        email: trimmedEmail
                    }
                });
                return res.status(400).json({ message: 'Email already exists' });
            }
        }

        // Validate role permissions
        if (req.user.role === 'librarian' && resolvedRole === 'admin') {
            setAuditContext(req, {
                success: false,
                status: 'PermissionDenied',
                description: 'User creation failed: librarians cannot create admin users'
            });
            return res.status(403).json({ message: 'Cannot create admin users' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user document
        const userData = {
            username,
            email: trimmedEmail || null,
            password: hashedPassword,
            firstName,
            lastName,
            role: resolvedRole,
            studentNumber: studentNumber || null,
            curriculum: curriculum || null,
            gradeLevel: gradeLevel || null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: req.user.id,
            lastLoginAt: null,
            profile: {
                phone: '',
                address: '',
                dateOfBirth: null
            },
            library: {
                cardNumber: studentNumber || `USER-${Date.now()}`,
                membershipDate: new Date(),
                borrowingLimit: resolvedRole === 'student' ? 5 : 10,
                fineBalance: 0
            },
            borrowingStats: {
                totalBorrowed: 0,
                currentlyBorrowed: 0,
                totalReturned: 0,
                totalFines: 0
            }
        };

        const newUser = await req.dbAdapter.createUser(userData);

        setAuditContext(req, {
            entityId: newUser._id,
            resourceId: newUser._id,
            description: `Created user ${newUser.username}`,
            details: {
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
            },
            metadata: {
                actorId: req.user.id,
                createdAt: newUser.createdAt,
                role: newUser.role
            },
            success: true,
            status: 'Created'
        });

        res.status(201).json({
            message: 'User created successfully',
            userId: newUser._id,
            username: newUser.username,
            email: newUser.email
        });

    } catch (error) {
        console.error('Create user error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `User creation failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to create user', error: error.message });
    }
});

// Update user (Admin, Librarian, or user themselves)
router.put('/:id/status', verifyToken, requireStaff, logAction('UPDATE_STATUS', 'user'), async(req, res) => {
    try {
        const userId = req.params.id;
        const { isActive } = req.body;

        setAuditContext(req, {
            entityId: userId,
            metadata: {
                updateStatusRequest: {
                    userId,
                    isActive
                }
            }
        });

        if (typeof isActive !== 'boolean') {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'User status update failed: isActive must be boolean'
            });
            return res.status(400).json({ message: 'isActive must be a boolean' });
        }

        const user = await req.dbAdapter.findUserById(userId);
        if (!user) {
            setAuditContext(req, {
                success: false,
                status: 'UserNotFound',
                description: `User status update failed: user ${userId} not found`
            });
            return res.status(404).json({ message: 'User not found' });
        }

        if (userId === req.user.id && isActive === false) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'User status update failed: cannot deactivate own account'
            });
            return res.status(400).json({ message: 'Cannot deactivate your own account' });
        }

        if (req.user.role === 'staff' && user.role === 'admin') {
            setAuditContext(req, {
                success: false,
                status: 'PermissionDenied',
                description: 'User status update failed: staff cannot modify admin accounts'
            });
            return res.status(403).json({ message: 'Cannot change status of admin users' });
        }

        if (req.user.role === 'librarian' && user.role === 'admin' && isActive === false) {
            setAuditContext(req, {
                success: false,
                status: 'PermissionDenied',
                description: 'User status update failed: librarians cannot deactivate admins'
            });
            return res.status(403).json({ message: 'Cannot deactivate admin users' });
        }

        await req.dbAdapter.updateUser(userId, {
            isActive,
            updatedAt: new Date(),
            updatedBy: req.user.id
        });

        setAuditContext(req, {
            entityId: userId,
            description: `Updated user status for ${user.username}`,
            details: {
                username: user.username,
                previousStatus: Boolean(user.isActive),
                newStatus: Boolean(isActive),
            },
            metadata: {
                actorId: req.user.id,
                newStatus: Boolean(isActive)
            },
            success: true,
            status: 'Updated'
        });

        res.json({ message: 'User status updated successfully', isActive });
    } catch (error) {
        console.error('Update user status error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Failed',
            description: 'Failed to update user status',
            details: { error: error.message },
        });
        res.status(500).json({ message: 'Failed to update user status' });
    }
});

router.post('/:id/avatar', verifyToken, logAction('UPLOAD_AVATAR', 'user'), async(req, res) => {
    avatarUpload.single('avatar')(req, res, async(uploadError) => {
        if (uploadError) {
            const message = uploadError instanceof multer.MulterError
                ? uploadError.code === 'LIMIT_FILE_SIZE'
                    ? 'File too large. Maximum size is 5 MB.'
                    : uploadError.message
                : uploadError.message;

            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Avatar upload failed',
                metadata: {
                    error: message
                }
            });
            return res.status(400).json({ message: message || 'Failed to upload avatar' });
        }

        try {
            if (!req.file) {
                setAuditContext(req, {
                    success: false,
                    status: 'ValidationError',
                    description: 'Avatar upload failed: no file provided'
                });
                return res.status(400).json({ message: 'Please provide an image file to upload.' });
            }

            const resolvedId = req.params.id === 'me' ? req.user.id : req.params.id;
            if (!resolvedId) {
                setAuditContext(req, {
                    success: false,
                    status: 'ValidationError',
                    description: 'Avatar upload failed: missing user identifier'
                });
                return res.status(400).json({ message: 'Unable to resolve user identifier.' });
            }

            const canModify = resolvedId === req.user.id || ['admin', 'librarian', 'staff'].includes(req.user.role);
            if (!canModify) {
                setAuditContext(req, {
                    success: false,
                    status: 'PermissionDenied',
                    description: 'Avatar upload failed: insufficient permissions'
                });
                return res.status(403).json({ message: 'You do not have permission to update this avatar.' });
            }

            const targetUser = await req.dbAdapter.findUserById(resolvedId);
            if (!targetUser) {
                setAuditContext(req, {
                    success: false,
                    status: 'UserNotFound',
                    description: 'Avatar upload failed: user not found'
                });
                return res.status(404).json({ message: 'User not found.' });
            }

            const relativeUrl = path.posix.join('/uploads/avatars', req.file.filename);
            const avatarPayload = {
                url: relativeUrl,
                filename: req.file.filename,
                mimeType: req.file.mimetype,
                size: req.file.size,
                uploadedAt: new Date()
            };

            await req.dbAdapter.updateUser(resolvedId, {
                avatar: avatarPayload,
                avatarUrl: relativeUrl,
                updatedAt: new Date()
            });

            if (targetUser?.avatar?.filename && targetUser.avatar.filename !== req.file.filename) {
                const previousPath = path.join(AVATAR_STORAGE_DIR, targetUser.avatar.filename);
                await removeFileQuietly(previousPath);
            }

            setAuditContext(req, {
                success: true,
                status: 'Updated',
                entityId: resolvedId,
                description: `Updated avatar for user ${targetUser.username || resolvedId}`,
                metadata: {
                    filename: req.file.filename,
                    size: req.file.size,
                    mimeType: req.file.mimetype
                }
            });

            res.json({
                message: 'Profile photo updated successfully.',
                avatar: avatarPayload,
                avatarUrl: relativeUrl
            });
        } catch (error) {
            console.error('Avatar upload error:', error);
            setAuditContext(req, {
                success: false,
                status: 'Failed',
                description: 'Avatar upload failed due to server error',
                details: { error: error.message }
            });
            res.status(500).json({ message: 'Failed to update avatar.' });
        }
    });
});

router.put('/:id', verifyToken, logAction('UPDATE', 'user'), async(req, res) => {
    try {
        const userId = req.params.id;
        const {
            firstName,
            lastName,
            role,
            studentNumber,
            curriculum,
            gradeLevel,
            isActive,
            email
        } = req.body;

        const roleProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'role');
        const normalizedRoleInput = typeof role === 'string' ? role.trim() : role;
        const resolvedRole = roleProvided ? (normalizedRoleInput || 'student') : undefined; // fallback to student when role input is blank

        setAuditContext(req, {
            entityId: userId,
            metadata: {
                updateRequest: {
                    userId,
                    fields: Object.keys(req.body || {})
                }
            }
        });

        // Check permissions
        const canEdit = req.user.role === 'admin' ||
            req.user.role === 'librarian' ||
            req.user.id === userId;

        if (!canEdit) {
            setAuditContext(req, {
                success: false,
                status: 'PermissionDenied',
                description: 'User update failed: insufficient permissions'
            });
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        // Validate role change permissions
        if (roleProvided && req.user.id !== userId) {
            if (req.user.role === 'librarian' && resolvedRole === 'admin') {
                setAuditContext(req, {
                    success: false,
                    status: 'PermissionDenied',
                    description: 'User update failed: librarians cannot assign admin role'
                });
                return res.status(403).json({ message: 'Cannot set admin role' });
            }
            if (req.user.role === 'staff') {
                setAuditContext(req, {
                    success: false,
                    status: 'PermissionDenied',
                    description: 'User update failed: staff cannot change roles'
                });
                return res.status(403).json({ message: 'Cannot change user roles' });
            }
        }

        // Get current user data
        const user = await req.dbAdapter.findUserById(userId);
        if (!user) {
            setAuditContext(req, {
                success: false,
                status: 'UserNotFound',
                description: `User update failed: user ${userId} not found`
            });
            return res.status(404).json({ message: 'User not found' });
        }

        // Prepare update data
        const updateData = {
            updatedAt: new Date(),
            updatedBy: req.user.id
        };

        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (roleProvided && req.user.id !== userId) updateData.role = resolvedRole;
        if (studentNumber) updateData.studentNumber = studentNumber;
    if (curriculum) updateData.curriculum = curriculum;
        if (gradeLevel) updateData.gradeLevel = gradeLevel;
        if (email) updateData.email = email;
        if (isActive !== undefined && req.user.role !== 'student') updateData.isActive = isActive;

        await req.dbAdapter.updateUser(userId, updateData);

        setAuditContext(req, {
            entityId: userId,
            resourceId: userId,
            success: true,
            status: 'Updated',
            description: `Updated profile for user ${user.username || userId}`,
            details: {
                updatedFields: Object.keys(updateData).filter(key => key !== 'updatedAt' && key !== 'updatedBy'),
                role: updateData.role || user.role,
                isActive: updateData.isActive !== undefined ? updateData.isActive : user.isActive
            },
            metadata: {
                actorId: req.user.id,
                updatedAt: updateData.updatedAt
            }
        });

        res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Update user error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `User update failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to update user' });
    }
});

// Delete user (Admin only)
router.delete('/:id', verifyToken, requireAdmin, logAction('DELETE', 'user'), async(req, res) => {
    try {
        const userId = req.params.id;

        setAuditContext(req, {
            entityId: userId,
            metadata: {
                deleteRequest: {
                    userId
                }
            }
        });

        // Check if user exists
        const user = await req.dbAdapter.findUserById(userId);
        if (!user) {
            setAuditContext(req, {
                success: false,
                status: 'UserNotFound',
                description: `User deletion failed: user ${userId} not found`
            });
            return res.status(404).json({ message: 'User not found' });
        }

        // Cannot delete self
        if (userId === req.user.id) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'User deletion failed: cannot delete own account'
            });
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        // Delete user
        await req.dbAdapter.deleteUser(userId);

        setAuditContext(req, {
            success: true,
            status: 'Deleted',
            entityId: userId,
            resourceId: userId,
            description: `Deleted user ${user.username || userId}`,
            metadata: {
                actorId: req.user.id
            }
        });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `User deletion failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to delete user' });
    }
});

// Reset user password (Admin, Librarian only)
router.post('/:id/reset-password', verifyToken, requireLibrarian, logAction('RESET_PASSWORD', 'user'), async(req, res) => {
    try {
        const userId = req.params.id;
        const { newPassword } = req.body;

        setAuditContext(req, {
            entityId: userId,
            metadata: {
                resetPasswordRequest: {
                    userId,
                    providedPasswordLength: newPassword ? newPassword.length : null
                }
            }
        });

        if (!newPassword || newPassword.length < 6) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Password reset failed: password must be at least 6 characters'
            });
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // Check if user exists
        const user = await req.dbAdapter.findUserById(userId);
        if (!user) {
            setAuditContext(req, {
                success: false,
                status: 'UserNotFound',
                description: `Password reset failed: user ${userId} not found`
            });
            return res.status(404).json({ message: 'User not found' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await req.dbAdapter.updateUser(userId, {
            password: hashedPassword,
            updatedAt: new Date(),
            updatedBy: req.user.id
        });

        setAuditContext(req, {
            success: true,
            status: 'Completed',
            entityId: userId,
            resourceId: userId,
            description: `Reset password for user ${user.username || userId}`,
            metadata: {
                actorId: req.user.id
            }
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Password reset failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to reset password' });
    }
});

module.exports = router;
