const express = require('express');
const bcrypt = require('bcrypt');
const { verifyToken, requireRole, requireAdmin, requireLibrarian, requireStaff, logAction, setAuditContext } = require('../middleware/customAuth');
const router = express.Router();

// Helper function to generate library card number
const generateLibraryCardNumber = async(dbAdapter) => {
    const currentYear = new Date().getFullYear();
    const allUsers = await dbAdapter.findInCollection('users', { role: 'student' });

    // Find the highest library card number for current year
    const yearPrefix = currentYear.toString().slice(-2); // Last 2 digits of year (e.g., "25" for 2025)
    const existingCards = allUsers
        .filter(u => u.libraryCardNumber && u.libraryCardNumber.startsWith(`LIB-${yearPrefix}`))
        .map(u => {
            const match = u.libraryCardNumber.match(/LIB-\d{2}-(\d{4})/);
            return match ? parseInt(match[1]) : 0;
        });

    const nextNumber = existingCards.length > 0 ? Math.max(...existingCards) + 1 : 1;
    return `LIB-${yearPrefix}-${String(nextNumber).padStart(4, '0')}`;
};

// Get next library card number (for preview)
router.get('/next-library-card', verifyToken, requireStaff, async(req, res) => {
    try {
        const nextCardNumber = await generateLibraryCardNumber(req.dbAdapter);
        res.json({ nextCardNumber });
    } catch (error) {
        console.error('Error generating next library card number:', error);
        res.status(500).json({ message: 'Failed to generate next library card number', error: error.message });
    }
});

// Get all students with student-specific data
router.get('/', verifyToken, requireStaff, async(req, res) => {
    try {
        const filters = {
            role: 'student',
            ...req.query
        };

        const students = await req.dbAdapter.getUsers(filters);

        // Add additional student-specific processing
        const processedStudents = students.map(student => ({
            ...student,
            grade: student.grade || student.gradeLevel || 'N/A',
            section: student.section || 'N/A',
            dues: student.borrowingStats ?.totalFines || 0,
            studentId: student.studentId || student.studentNumber || 'N/A'
        }));

        res.json({
            students: processedStudents,
            total: processedStudents.length,
            page: parseInt(req.query.page) || 1,
            totalPages: Math.ceil(processedStudents.length / (parseInt(req.query.limit) || 50))
        });
    } catch (error) {
        console.error('Failed to fetch students:', error);
        res.status(500).json({ message: 'Failed to fetch students', error: error.message });
    }
});

// Get student by ID
router.get('/:id', verifyToken, requireStaff, async(req, res) => {
    try {
        const student = await req.dbAdapter.findUserById(req.params.id);

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        if (student.role !== 'student') {
            return res.status(400).json({ message: 'User is not a student' });
        }

        res.json({ student });
    } catch (error) {
        console.error('Get student error:', error);
        res.status(500).json({ message: 'Failed to fetch student' });
    }
});

// Create new student
router.post('/', verifyToken, requireLibrarian, logAction('CREATE', 'student'), async(req, res) => {
    try {
        // Generate library card number automatically
        const libraryCardNumber = await generateLibraryCardNumber(req.dbAdapter);

        const studentData = {
            // Library Card Information (auto-generated)
            libraryCardNumber: libraryCardNumber,

            // Login credentials
            username: req.body.username,

            // Basic Information
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            middleName: req.body.middleName,
            email: req.body.email,
            phoneNumber: req.body.phoneNumber,

            // Academic Information
            studentId: req.body.studentId,
            lrn: req.body.lrn, // Learner Reference Number
            grade: req.body.grade,
            section: req.body.section,
            curriculum: req.body.curriculum,

            // Address Information
            barangay: req.body.barangay,
            municipality: req.body.municipality,
            province: req.body.province,
            fullAddress: req.body.fullAddress,

            // Parent/Guardian Information
            parentGuardianName: req.body.parentGuardianName,
            parentOccupation: req.body.parentOccupation,
            parentAddress: req.body.parentAddress,
            parentPhone: req.body.parentPhone,
            parentEmail: req.body.parentEmail,

            // System fields
            role: 'student',
            isActive: true,
            borrowingStats: {
                totalBorrowed: 0,
                currentlyBorrowed: 0,
                totalFines: 0,
                totalReturned: 0
            },
            createdBy: req.user.uid
        };

        setAuditContext(req, {
            metadata: {
                createRequest: {
                    studentId: studentData.studentId || null,
                    lrn: studentData.lrn || null,
                    grade: studentData.grade || null,
                    section: studentData.section || null
                }
            },
            details: {
                profile: {
                    firstName: studentData.firstName,
                    lastName: studentData.lastName,
                    email: studentData.email,
                    curriculum: studentData.curriculum
                }
            }
        });

        // Validate required fields
        if (!studentData.firstName || !studentData.lastName || !studentData.studentId || !studentData.lrn) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Create student failed: missing required fields',
            });
            return res.status(400).json({
                message: 'Missing required fields: firstName, lastName, studentId, lrn'
            });
        }

        // Check if username already exists
        if (req.body.username) {
            const existingUsers = await req.dbAdapter.getUsers({ username: req.body.username });
            if (existingUsers.length > 0) {
                setAuditContext(req, {
                    success: false,
                    status: 'Conflict',
                    description: `Create student failed: username ${req.body.username} already exists`,
                    details: { username: req.body.username },
                });
                return res.status(400).json({ message: 'Username already exists' });
            }
        }

        // Hash the LRN to use as default password
        const hashedPassword = await bcrypt.hash(studentData.lrn, 10);

        // Add password to student data
        studentData.password = hashedPassword;

        // Create student using database adapter
        const student = await req.dbAdapter.createUser(studentData);

        setAuditContext(req, {
            entityId: student._id,
            resourceId: student._id,
            description: `Created student ${student.firstName} ${student.lastName}`,
            details: {
                studentId: student.studentId,
                grade: student.grade,
                section: student.section,
            },
            metadata: {
                actorId: req.user.id,
                libraryCardNumber: student.libraryCardNumber
            },
            success: true,
            status: 'Created'
        });

        res.status(201).json({
            message: 'Student created successfully',
            student
        });
    } catch (error) {
        console.error('Create student error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Failed',
            description: 'Failed to create student',
            details: { error: error.message },
        });
        res.status(500).json({
            message: 'Failed to create student',
            error: error.message
        });
    }
});

// Update student
router.put('/:id', verifyToken, requireLibrarian, logAction('UPDATE', 'student'), async(req, res) => {
    try {
        const updates = {
            ...req.body,
            updatedAt: new Date(),
            updatedBy: req.user.uid
        };

        setAuditContext(req, {
            entityId: req.params.id,
            metadata: {
                updateRequest: {
                    studentId: req.params.id,
                    fields: Object.keys(req.body || {})
                }
            }
        });

        const student = await req.dbAdapter.updateUser(req.params.id, updates);

        if (!student) {
            setAuditContext(req, {
                success: false,
                status: 'StudentNotFound',
                description: `Update student failed: ${req.params.id} not found`
            });
            return res.status(404).json({ message: 'Student not found' });
        }

        setAuditContext(req, {
            entityId: req.params.id,
            description: `Updated student ${student.firstName} ${student.lastName}`,
            details: {
                updatedFields: Object.keys(req.body || {}),
            },
            metadata: {
                actorId: req.user.id
            },
            success: true,
            status: 'Updated'
        });

        res.json({
            message: 'Student updated successfully',
            student
        });
    } catch (error) {
        console.error('Update student error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Failed',
            description: 'Failed to update student',
            details: { error: error.message },
        });
        res.status(500).json({
            message: 'Failed to update student',
            error: error.message
        });
    }
});

// Delete student
router.delete('/:id', verifyToken, requireLibrarian, logAction('DELETE', 'student'), async(req, res) => {
    try {
        setAuditContext(req, {
            entityId: req.params.id
        });

        const student = await req.dbAdapter.findUserById(req.params.id);

        if (!student) {
            setAuditContext(req, {
                success: false,
                status: 'StudentNotFound',
                description: `Delete student failed: ${req.params.id} not found`
            });
            return res.status(404).json({ message: 'Student not found' });
        }

        if (student.role !== 'student') {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Delete student failed: user is not a student'
            });
            return res.status(400).json({ message: 'User is not a student' });
        }

        await req.dbAdapter.deleteUser(req.params.id);

        setAuditContext(req, {
            entityId: req.params.id,
            description: `Deleted student ${student.firstName} ${student.lastName}`,
            details: {
                studentId: student.studentId,
            },
            metadata: {
                actorId: req.user.id
            },
            success: true,
            status: 'Deleted'
        });

        res.json({ message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Delete student error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Failed',
            description: 'Failed to delete student',
            details: { error: error.message },
        });
        res.status(500).json({
            message: 'Failed to delete student',
            error: error.message
        });
    }
});

// Bulk import students
router.post('/bulk-import', verifyToken, requireLibrarian, logAction('BULK_IMPORT', 'students'), async(req, res) => {
    try {
        const { students } = req.body;

        if (!Array.isArray(students) || students.length === 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Student bulk import failed: students array is required'
            });
            return res.status(400).json({ message: 'Students array is required' });
        }

        setAuditContext(req, {
            metadata: {
                bulkImportRequest: {
                    count: students.length
                }
            }
        });

        const results = {
            successful: [],
            failed: []
        };

        for (const studentData of students) {
            try {
                // Generate library card number for each student
                const libraryCardNumber = await generateLibraryCardNumber(req.dbAdapter);

                // Hash LRN as password if provided
                let hashedPassword = null;
                if (studentData.lrn) {
                    hashedPassword = await bcrypt.hash(studentData.lrn, 10);
                }

                const newStudent = {
                    ...studentData,
                    libraryCardNumber: libraryCardNumber, // Auto-generated
                    password: hashedPassword || studentData.password, // Use LRN or provided password
                    role: 'student',
                    isActive: true,
                    borrowingStats: {
                        totalBorrowed: 0,
                        currentlyBorrowed: 0,
                        totalFines: 0,
                        totalReturned: 0
                    },
                    createdBy: req.user.uid
                };

                const student = await req.dbAdapter.createUser(newStudent);
                results.successful.push(student);
            } catch (error) {
                results.failed.push({
                    studentData,
                    error: error.message
                });
            }
        }

        setAuditContext(req, {
            success: true,
            status: 'Completed',
            description: `Imported ${results.successful.length} students (${results.failed.length} failed)`,
            details: {
                success: results.successful.length,
                errors: results.failed.length,
            },
            metadata: {
                actorId: req.user.id
            }
        });

        res.json({
            message: `Bulk import completed. ${results.successful.length} successful, ${results.failed.length} failed.`,
            results: {
                success: results.successful.length,
                errors: results.failed.length,
                details: [
                    ...results.successful.map(s => ({
                        studentId: s.studentId,
                        status: 'success',
                        message: 'Imported successfully'
                    })),
                    ...results.failed.map(f => ({
                        studentId: f.studentData.studentId,
                        status: 'error',
                        message: f.error
                    }))
                ]
            }
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({
            message: 'Failed to import students',
            error: error.message
        });
    }
});

module.exports = router;
