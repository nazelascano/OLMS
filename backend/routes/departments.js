const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/customAuth');
const {
  DEFAULT_DEPARTMENTS,
  normalizeStringList,
  toSlug
} = require('../utils/userAttributes');

// Get all departments
router.get('/', verifyToken, async (req, res) => {
  try {
    const setting = await req.dbAdapter.findOneInCollection('settings', { id: 'USER_DEPARTMENTS' });
    const departments = normalizeStringList(setting?.value, DEFAULT_DEPARTMENTS);

    const response = departments.map((name, index) => ({
      id: toSlug(name, `department-${index}`),
      name
    }));

    res.json(response);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ message: 'Failed to fetch departments' });
  }
});

module.exports = router;
