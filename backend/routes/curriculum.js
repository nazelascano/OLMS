const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/customAuth');
const {
  DEFAULT_CURRICULA,
  normalizeStringList,
  toSlug
} = require('../utils/userAttributes');

// Get all curriculum options
router.get('/', verifyToken, async (req, res) => {
  try {
    const setting = await req.dbAdapter.findOneInCollection('settings', { id: 'USER_CURRICULA' });
    const curriculumOptions = normalizeStringList(setting?.value, DEFAULT_CURRICULA);

    const response = curriculumOptions.map((name, index) => ({
      id: toSlug(name, `curriculum-${index}`),
      name
    }));

    res.json(response);
  } catch (error) {
    console.error('Get curriculum options error:', error);
    res.status(500).json({ message: 'Failed to fetch curriculum options' });
  }
});

module.exports = router;
