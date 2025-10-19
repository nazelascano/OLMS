const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/customAuth');

// Get all departments
router.get('/', verifyToken, async (req, res) => {
  try {
    // Return hardcoded departments or fetch from users
    const departments = [
      { id: 'grade1', name: 'Grade 1' },
      { id: 'grade2', name: 'Grade 2' },
      { id: 'grade3', name: 'Grade 3' },
      { id: 'grade4', name: 'Grade 4' },
      { id: 'grade5', name: 'Grade 5' },
      { id: 'grade6', name: 'Grade 6' },
      { id: 'grade7', name: 'Grade 7' },
      { id: 'grade8', name: 'Grade 8' },
      { id: 'grade9', name: 'Grade 9' },
      { id: 'grade10', name: 'Grade 10' },
      { id: 'grade11', name: 'Grade 11' },
      { id: 'grade12', name: 'Grade 12' },
      { id: 'staff', name: 'Staff' },
      { id: 'faculty', name: 'Faculty' }
    ];
    res.json(departments);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ message: 'Failed to fetch departments' });
  }
});

module.exports = router;
