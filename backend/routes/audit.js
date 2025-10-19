const express = require('express');
const { verifyToken, requireStaff } = require('../middleware/customAuth');
const router = express.Router();

// Get audit logs with pagination and filters
router.get('/', verifyToken, requireStaff, async(req, res) => {
    try {
        const {
            page = 1,
                limit = 50,
                action,
                entity,
                userId,
                startDate,
                endDate
        } = req.query;

        // Build query filters
        let filters = {};
        if (action) filters.action = action;
        if (entity) filters.entity = entity;
        if (userId) filters.userId = userId;

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
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const allLogs = await req.dbAdapter.findInCollection('audit', {});

        // Filter logs by date
        const recentLogs = allLogs.filter(log => new Date(log.timestamp) >= startDate);

        const stats = {
            totalLogs: recentLogs.length,
            actionCounts: {},
            entityCounts: {},
            userCounts: {},
            dailyActivity: {}
        };

        recentLogs.forEach(log => {
            // Count by action
            if (!stats.actionCounts[log.action]) {
                stats.actionCounts[log.action] = 0;
            }
            stats.actionCounts[log.action]++;

            // Count by entity
            if (!stats.entityCounts[log.entity]) {
                stats.entityCounts[log.entity] = 0;
            }
            stats.entityCounts[log.entity]++;

            // Count by user
            if (!stats.userCounts[log.userId]) {
                stats.userCounts[log.userId] = 0;
            }
            stats.userCounts[log.userId]++;

            // Count by day
            const day = new Date(log.timestamp).toDateString();
            if (!stats.dailyActivity[day]) {
                stats.dailyActivity[day] = 0;
            }
            stats.dailyActivity[day]++;
        });

        res.json(stats);
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