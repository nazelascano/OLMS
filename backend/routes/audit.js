const express = require('express');
const { verifyToken, requireStaff } = require('../middleware/customAuth');
const router = express.Router();

const toPlainObject = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const collectUserSearchCandidates = (log = {}) => {
    const details = toPlainObject(log.details);
    const metadata = toPlainObject(log.metadata);
    const nestedUser = toPlainObject(log.user);
    const detailStudent = toPlainObject(details.student);
    const metadataStudent = toPlainObject(metadata.student);
    const detailUser = toPlainObject(details.user);
    const metadataUser = toPlainObject(metadata.user);
    const detailLibrary = toPlainObject(details.library);
    const metadataLibrary = toPlainObject(metadata.library);
    const nestedLibrary = toPlainObject(nestedUser.library);
    const detailUserLibrary = toPlainObject(detailUser.library);
    const metadataUserLibrary = toPlainObject(metadataUser.library);
    const detailProfile = toPlainObject(details.profile);
    const metadataProfile = toPlainObject(metadata.profile);
    const profileLibrary = toPlainObject(detailProfile.library);
    const metadataProfileLibrary = toPlainObject(metadataProfile.library);
    const request = toPlainObject(metadata.createRequest || metadata.request);
    const requestStudent = toPlainObject(request.student);
    const requestLibrary = toPlainObject(request.library);

    const buildName = (source) => {
        if (!source) return '';
        return [source.firstName, source.middleName, source.lastName]
            .filter(Boolean)
            .join(' ');
    };

    return [
        log.userId,
        details.userId,
        metadata.userId,
        detailUser.userId,
        metadataUser.userId,
        detailUser.id,
        metadataUser.id,
        nestedUser.id,
        nestedUser.userId,
        log.studentName,
        details.studentName,
        metadata.studentName,
        detailStudent.name,
        metadataStudent.name,
        detailUser.name,
        metadataUser.name,
        detailProfile.name,
        metadataProfile.name,
        request.studentName,
        request.name,
        buildName(detailProfile),
        buildName(metadataProfile),
        buildName(request),
        buildName(requestStudent),
        buildName(detailStudent),
        buildName(metadataStudent),
        buildName(detailUser),
        buildName(metadataUser),
        buildName(nestedUser),
        log.username,
        details.username,
        metadata.username,
        detailUser.username,
        metadataUser.username,
        nestedUser.username,
        log.userName,
        log.userEmail,
        nestedUser.email,
        detailUser.email,
        metadataUser.email,
        log.libraryId,
        log.libraryCardNumber,
        details.libraryId,
        details.libraryCardNumber,
        detailLibrary.cardNumber,
        detailStudent.libraryCardNumber,
        metadataStudent.libraryCardNumber,
        detailProfile.libraryCardNumber,
        metadataProfile.libraryCardNumber,
        profileLibrary.cardNumber,
        metadataProfileLibrary.cardNumber,
        request.libraryId,
        request.libraryCardNumber,
        requestStudent.libraryCardNumber,
        requestLibrary.cardNumber,
        metadata.libraryId,
        metadata.libraryCardNumber,
        metadataLibrary.cardNumber,
        detailUserLibrary.cardNumber,
        metadataUserLibrary.cardNumber,
        nestedUser.libraryCardNumber,
        nestedLibrary.cardNumber,
    ].filter(Boolean);
};

const collectUserRecordCandidates = (user = {}) => {
    const library = toPlainObject(user.library);
    return [
        user._id,
        user.id,
        user.userId,
        user.username,
        user.email,
        user.firstName,
        user.middleName,
        user.lastName,
        [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
        library.cardNumber,
        library.cardId,
        user.libraryCardNumber,
    ].filter(Boolean);
};

const matchesUserRecord = (user, term) => {
    if (!term) return false;
    const normalized = term.trim().toLowerCase();
    if (!normalized) return false;
    return collectUserRecordCandidates(user).some((candidate) =>
        String(candidate).toLowerCase().includes(normalized)
    );
};

const collectLogIdentifierSet = (log) => {
    const candidates = collectUserSearchCandidates(log);
    return new Set(
        candidates.map((candidate) => String(candidate).toLowerCase())
    );
};

const matchesUserQuery = (log, term) => {
    if (!term) return true;
    const normalized = term.trim().toLowerCase();
    if (!normalized) return true;
    return collectUserSearchCandidates(log).some((candidate) =>
        String(candidate).toLowerCase().includes(normalized)
    );
};

// Get audit logs with pagination and filters
router.get('/', verifyToken, requireStaff, async(req, res) => {
    try {
        const {
            page = 1,
                limit = 50,
                action,
                entity,
                userId,
                role,
                userQuery,
                startDate,
                endDate
        } = req.query;
        const normalizedUserQuery = typeof userQuery === 'string' ? userQuery.trim() : '';

        // Build query filters
        let filters = {};
        if (action) filters.action = action;
        if (entity) filters.entity = entity;
        if (userId) filters.userId = userId;
        if (role) filters.userRole = role;

        // Get all matching audit logs
        let auditLogs = await req.dbAdapter.findInCollection('audit', filters);

        // Apply date filter
        if (startDate || endDate) {
            auditLogs = auditLogs.filter(log => {
                const logDate = new Date(log.timestamp);
                if (startDate && logDate < new Date(startDate)) return false;
                if (endDate && logDate > new Date(endDate)) return false;
                return true;
            });
        }

        // Apply user search filter across identifiers
        let matchedUserIdentifiers = null;

        if (normalizedUserQuery) {
            const users = await req.dbAdapter.findInCollection('users', {});
            matchedUserIdentifiers = new Set();

            users.forEach((user) => {
                if (matchesUserRecord(user, normalizedUserQuery)) {
                    collectUserRecordCandidates(user).forEach((identifier) =>
                        matchedUserIdentifiers.add(String(identifier).toLowerCase()),
                    );
                }
            });

            auditLogs = auditLogs.filter((log) => {
                if (matchesUserQuery(log, normalizedUserQuery)) {
                    return true;
                }

                if (matchedUserIdentifiers && matchedUserIdentifiers.size > 0) {
                    const logIdentifiers = collectLogIdentifierSet(log);
                    for (const identifier of logIdentifiers) {
                        if (matchedUserIdentifiers.has(identifier)) {
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        // Sort by timestamp descending
        auditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply pagination
        const skip = (page - 1) * limit;
        const total = auditLogs.length;
        const paginatedLogs = auditLogs.slice(skip, skip + parseInt(limit));

        res.json({
            logs: paginatedLogs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ message: 'Failed to fetch audit logs' });
    }
});

// Get audit logs for specific user
router.get('/user/:userId', verifyToken, requireStaff, async(req, res) => {
    try {
        const userId = req.params.userId;
        const { limit = 100 } = req.query;

        let userLogs = await req.dbAdapter.findInCollection('audit', { userId });

        // Sort by timestamp descending
        userLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply limit
        userLogs = userLogs.slice(0, parseInt(limit));

        res.json(userLogs);
    } catch (error) {
        console.error('Get user audit logs error:', error);
        res.status(500).json({ message: 'Failed to fetch user audit logs' });
    }
});

// Get audit logs by action type
router.get('/action/:action', verifyToken, requireStaff, async(req, res) => {
    try {
        const action = req.params.action;
        const { limit = 100, startDate, endDate } = req.query;

        let actionLogs = await req.dbAdapter.findInCollection('audit', { action });

        // Apply date filter if provided
        if (startDate || endDate) {
            actionLogs = actionLogs.filter(log => {
                const logDate = new Date(log.timestamp);
                if (startDate && logDate < new Date(startDate)) return false;
                if (endDate && logDate > new Date(endDate)) return false;
                return true;
            });
        }

        // Sort by timestamp descending
        actionLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply limit
        if (limit) {
            actionLogs = actionLogs.slice(0, parseInt(limit));
        }

        res.json(actionLogs);
    } catch (error) {
        console.error('Get action audit logs error:', error);
        res.status(500).json({ message: 'Failed to fetch action audit logs' });
    }
});

// Get audit statistics (alias)
router.get('/stats', verifyToken, requireStaff, async(req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const allLogs = await req.dbAdapter.findInCollection('audit', {});

        // Filter logs by date
        const recentLogs = allLogs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= startDate;
        });

        // Count by action type
        const actionCounts = {};
        recentLogs.forEach(log => {
            actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        });

        res.json({
            totalLogs: recentLogs.length,
            actionCounts,
            dateRange: { startDate, endDate: new Date() }
        });
    } catch (error) {
        console.error('Get audit stats error:', error);
        res.status(500).json({ message: 'Failed to fetch audit statistics' });
    }
});

// Get audit summary/statistics
router.get('/stats/summary', verifyToken, requireStaff, async(req, res) => {
    try {
        const {
            days = 7,
            action,
            entity,
            role,
            userQuery,
            startDate,
            endDate,
        } = req.query;

        const normalizedUserQuery = typeof userQuery === 'string' ? userQuery.trim() : '';
        const parsedDays = Number.isNaN(parseInt(days, 10)) ? 7 : parseInt(days, 10);

        let filters = {};
        if (action) filters.action = action;
        if (entity) filters.entity = entity;
        if (role) filters.userRole = role;

        let filteredLogs = await req.dbAdapter.findInCollection('audit', filters);

        const parseDate = (value) => {
            if (!value) return null;
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const rangeStart = parseDate(startDate) || (() => {
            const fallback = new Date();
            fallback.setDate(fallback.getDate() - parsedDays);
            return fallback;
        })();

        const rangeEnd = parseDate(endDate) || new Date();

        // Normalize ordering if dates are inverted
        let normalizedStart = rangeStart;
        let normalizedEnd = rangeEnd;
        if (normalizedStart > normalizedEnd) {
            const temp = normalizedStart;
            normalizedStart = normalizedEnd;
            normalizedEnd = temp;
        }

        filteredLogs = filteredLogs.filter((log) => {
            const timestamp = new Date(log.timestamp);
            if (Number.isNaN(timestamp.getTime())) {
                return false;
            }
            return timestamp >= normalizedStart && timestamp <= normalizedEnd;
        });

        if (normalizedUserQuery) {
            const users = await req.dbAdapter.findInCollection('users', {});
            const matchedUserIdentifiers = new Set();

            users.forEach((user) => {
                if (matchesUserRecord(user, normalizedUserQuery)) {
                    collectUserRecordCandidates(user).forEach((identifier) =>
                        matchedUserIdentifiers.add(String(identifier).toLowerCase()),
                    );
                }
            });

            filteredLogs = filteredLogs.filter((log) => {
                if (matchesUserQuery(log, normalizedUserQuery)) {
                    return true;
                }

                if (matchedUserIdentifiers.size > 0) {
                    const logIdentifiers = collectLogIdentifierSet(log);
                    for (const identifier of logIdentifiers) {
                        if (matchedUserIdentifiers.has(identifier)) {
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        const stats = {
            totalLogs: filteredLogs.length,
            actionCounts: {},
            entityCounts: {},
            userCounts: {},
            dailyActivity: {},
        };

        filteredLogs.forEach((log) => {
            const actionKey = log?.action || 'unknown';
            stats.actionCounts[actionKey] = (stats.actionCounts[actionKey] || 0) + 1;

            const entityKey = log?.entity || log?.resource || 'unknown';
            stats.entityCounts[entityKey] = (stats.entityCounts[entityKey] || 0) + 1;

            const userKey = log?.userId || log?.userEmail || log?.userName || 'unknown';
            stats.userCounts[userKey] = (stats.userCounts[userKey] || 0) + 1;

            const dayKey = new Date(log.timestamp).toDateString();
            stats.dailyActivity[dayKey] = (stats.dailyActivity[dayKey] || 0) + 1;
        });

        res.json({
            ...stats,
            dateRange: {
                startDate: normalizedStart,
                endDate: normalizedEnd,
            },
            filtersApplied: {
                action: action || null,
                entity: entity || null,
                role: role || null,
                userQuery: normalizedUserQuery || null,
            },
        });
    } catch (error) {
        console.error('Get audit stats error:', error);
        res.status(500).json({ message: 'Failed to fetch audit statistics' });
    }
});

// Get recent activity
router.get('/recent/activity', verifyToken, requireStaff, async(req, res) => {
    try {
        const { limit = 20 } = req.query;

        let recentActivity = await req.dbAdapter.findInCollection('audit', {});

        // Sort by timestamp descending
        recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply limit
        recentActivity = recentActivity.slice(0, parseInt(limit));

        res.json(recentActivity);
    } catch (error) {
        console.error('Get recent activity error:', error);
        res.status(500).json({ message: 'Failed to fetch recent activity' });
    }
});

// Export audit logs (Admin only)
router.get('/export/csv', verifyToken, requireStaff, async(req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let allLogs = await req.dbAdapter.findInCollection('audit', {});

        // Filter by date if provided
        if (startDate || endDate) {
            allLogs = allLogs.filter(log => {
                const logDate = new Date(log.timestamp);
                if (startDate && logDate < new Date(startDate)) return false;
                if (endDate && logDate > new Date(endDate)) return false;
                return true;
            });
        }

        // Sort by timestamp descending
        allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Create CSV content
        const headers = ['Timestamp', 'User Email', 'User Role', 'Action', 'Entity', 'Entity ID', 'IP Address', 'Status'];
        let csvContent = headers.join(',') + '\n';

        allLogs.forEach(log => {
            const row = [
                new Date(log.timestamp).toISOString(),
                log.userEmail || '',
                log.userRole || '',
                log.action || '',
                log.entity || '',
                log.entityId || '',
                log.ipAddress || '',
                log.status || ''
            ];
            csvContent += row.map(field => `"${field}"`).join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
        res.send(csvContent);

    } catch (error) {
        console.error('Export audit logs error:', error);
        res.status(500).json({ message: 'Failed to export audit logs' });
    }
});

// Get audit log by ID (MUST BE LAST - catch-all route)
router.get('/:id', verifyToken, requireStaff, async(req, res) => {
    try {
        const log = await req.dbAdapter.findOneInCollection('audit', { id: req.params.id });

        if (!log) {
            return res.status(404).json({ message: 'Audit log not found' });
        }

        res.json(log);
    } catch (error) {
        console.error('Get audit log error:', error);
        res.status(500).json({ message: 'Failed to fetch audit log' });
    }
});

module.exports = router;