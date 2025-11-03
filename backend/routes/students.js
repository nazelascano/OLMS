const express = require('express');
const bcrypt = require('bcrypt');
const { verifyToken, requireRole, requireAdmin, requireLibrarian, requireStaff, logAction, setAuditContext } = require('../middleware/customAuth');
const router = express.Router();

// Determine the current academic cycle in YYYY-YYYY format.
const computeSchoolYearFromDate = (dateInput) => {
    const source = dateInput ? new Date(dateInput) : new Date();
    const baseYear = Number.isFinite(source.getFullYear()) ? source.getFullYear() : new Date().getFullYear();
    return `${baseYear}-${baseYear + 1}`;
};

const resolveSchoolYear = (payload = {}) => {
    const provided = (payload.schoolYear || payload.academicYear || '').toString().trim();
    if (provided) return provided;

    const timestamp = payload.createdAt || payload.updatedAt;
    return computeSchoolYearFromDate(timestamp);
};

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
        const {
            page = 1,
            limit = 20,
            grade,
            section,
            curriculum,
            search,
            isActive
        } = req.query;

        const baseFilters = { role: 'student' };
        if (curriculum) baseFilters.curriculum = curriculum;
        if (isActive !== undefined) baseFilters.isActive = isActive === 'true';

        const students = await req.dbAdapter.getUsers(baseFilters);

        // Backfill missing school year data for legacy records.
        const hydratedStudents = await Promise.all(students.map(async(student) => {
            if (!student || student.schoolYear || student.academicYear) {
                return student;
            }

            const computedYear = resolveSchoolYear(student);
            try {
                await req.dbAdapter.updateUser(student._id, {
                    schoolYear: computedYear,
                    academicYear: computedYear
                });
                return {
                    ...student,
                    schoolYear: computedYear,
                    academicYear: computedYear
                };
            } catch (error) {
                console.warn(`Failed to backfill school year for student ${student._id}:`, error.message);
                return student;
            }
        }));

        const enhancedStudents = hydratedStudents.map(student => ({
            ...student,
            grade: student.grade || student.gradeLevel || 'N/A',
            section: student.section || 'N/A',
            dues: student.borrowingStats?.totalFines || 0,
            studentId: student.studentId || student.studentNumber || 'N/A'
        }));

        const searchTerm = typeof search === 'string' ? search.toLowerCase() : '';
        let filteredStudents = enhancedStudents;

        if (grade) {
            const gradeLower = grade.toString().toLowerCase();
            filteredStudents = filteredStudents.filter(student =>
                (student.grade || '').toString().toLowerCase() === gradeLower ||
                (student.gradeLevel || '').toString().toLowerCase() === gradeLower
            );
        }

        if (section) {
            const sectionLower = section.toString().toLowerCase();
            filteredStudents = filteredStudents.filter(student =>
                (student.section || '').toString().toLowerCase() === sectionLower
            );
        }

        if (searchTerm) {
            filteredStudents = filteredStudents.filter(student => {
                const valuesToMatch = [
                    student.firstName,
                    student.lastName,
                    student.middleName,
                    student.email,
                    student.username,
                    student.studentId,
                    student.studentNumber,
                    student.libraryCardNumber,
                    student.lrn,
                    student.library?.cardNumber
                ];
                return valuesToMatch.some(value =>
                    value && value.toString().toLowerCase().includes(searchTerm)
                );
            });
        }

        const total = filteredStudents.length;
        const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
        const limitString = typeof limit === 'string' ? limit.toLowerCase() : limit;
        const wantsAll = limitString === 'all' || parseInt(limit, 10) === -1;
        const resolvedLimit = wantsAll ? total : Math.max(parseInt(limit, 10) || 20, 1);
        const offset = wantsAll ? 0 : (normalizedPage - 1) * resolvedLimit;
        const paginatedStudents = wantsAll ? filteredStudents : filteredStudents.slice(offset, offset + resolvedLimit);
        const totalPages = wantsAll ? (total > 0 ? 1 : 0) : Math.ceil(total / resolvedLimit);

        res.json({
            students: paginatedStudents,
            total,
            page: normalizedPage,
            totalPages,
            pagination: {
                page: normalizedPage,
                limit: resolvedLimit,
                total,
                pages: totalPages,
                mode: wantsAll ? 'all' : 'paged'
            }
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
        const schoolYear = resolveSchoolYear(req.body);

        const studentData = {
            // Library Card Information (auto-generated)
            libraryCardNumber: libraryCardNumber,

            // Login credentials - use LRN as username (per requirement)
                username: req.body.lrn || req.body.username,

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
            schoolYear: schoolYear,
            academicYear: schoolYear,

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
                    section: studentData.section || null,
                    schoolYear: studentData.schoolYear || null
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

        // Determine username (prefer LRN) and ensure uniqueness
        const usernameToUse = studentData.lrn || studentData.username;
        if (!usernameToUse) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Create student failed: username (lrn) is required'
            });
            return res.status(400).json({ message: 'LRN (used as username) is required' });
        }

        const existingUsers = await req.dbAdapter.getUsers({ username: usernameToUse });
        if (existingUsers.length > 0) {
            setAuditContext(req, {
                success: false,
                status: 'Conflict',
                description: `Create student failed: username ${usernameToUse} already exists`,
                details: { username: usernameToUse },
            });
            return res.status(400).json({ message: 'Username already exists' });
        }

    // Build default raw password: first letter of firstName + surname (preferred) or username (fallback)
    // Rationale: using surname (lastName) makes the default password more memorable (e.g., "JSmith")
    // while still keeping a deterministic rule. If lastName is missing, fall back to usernameToUse.
    const firstInitial = (studentData.firstName || '').charAt(0) || '';
    const surname = (studentData.lastName || '').toString().replace(/\s+/g, '');
    const rawPassword = surname ? `${firstInitial}${surname}` : `${firstInitial}${usernameToUse}`;
        const hashedPassword = await bcrypt.hash(rawPassword.toLowerCase(), 10);
        studentData.password = hashedPassword;
        
        // ensure username field is set to the chosen username
        studentData.username = usernameToUse;

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

        // Validate that every row includes an LRN (we require LRN as username)
        const missingLrnRows = students
            .map((s, idx) => ({ idx, studentId: s.studentId || null, lrn: s.lrn }))
            .filter(r => !r.lrn || String(r.lrn).trim() === '');

        if (missingLrnRows.length > 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Student bulk import failed: one or more rows missing LRN',
                details: { missingRows: missingLrnRows }
            });
            return res.status(400).json({
                message: 'Bulk import requires LRN for every student. One or more rows are missing LRN.',
                missing: missingLrnRows
            });
        }

        // Pre-validate payload for other errors (duplicates, invalid emails, missing required fields)
        const errors = [];

        // Helper: find duplicates in array
        const findDuplicates = (arr) => arr.reduce((acc, val, idx, a) => {
            if (a.indexOf(val) !== idx && !acc.includes(val)) acc.push(val);
            return acc;
        }, []);

        // Trim and normalize usernames (LRN) and studentIds
        const normalized = students.map((s, idx) => ({
            idx,
            firstName: (s.firstName || '').toString().trim(),
            lastName: (s.lastName || '').toString().trim(),
            studentId: (s.studentId || '').toString().trim(),
            lrn: (s.lrn || '').toString().trim(),
            email: (s.email || '').toString().trim().toLowerCase()
        }));

        // Check for required fields and invalid email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        normalized.forEach((row) => {
            const rowErrors = [];
            if (!row.firstName) rowErrors.push('Missing firstName');
            if (!row.lastName) rowErrors.push('Missing lastName');
            if (!row.studentId) rowErrors.push('Missing studentId');
            if (!row.lrn) rowErrors.push('Missing lrn'); // redundant if earlier, but keep for specificity
            if (row.email && !emailRegex.test(row.email)) rowErrors.push('Invalid email');
            if (rowErrors.length > 0) {
                errors.push({ idx: row.idx, studentId: row.studentId || null, issues: rowErrors });
            }
        });

        // Check duplicate LRNs and studentIds within payload
        const lrns = normalized.map(r => r.lrn).filter(Boolean);
        const duplicateLrns = findDuplicates(lrns);
        duplicateLrns.forEach((dup) => {
            // find all indices with this dup
            normalized.forEach(r => { if (r.lrn === dup) errors.push({ idx: r.idx, studentId: r.studentId || null, issues: ['Duplicate lrn in payload'] }); });
        });

        const studentIds = normalized.map(r => r.studentId).filter(Boolean);
        const duplicateStudentIds = findDuplicates(studentIds);
        duplicateStudentIds.forEach((dup) => {
            normalized.forEach(r => { if (r.studentId === dup) errors.push({ idx: r.idx, studentId: r.studentId || null, issues: ['Duplicate studentId in payload'] }); });
        });

        // Check duplicates against DB for usernames (lrn) and studentId using batched queries
        const uniqueLrns = Array.from(new Set(lrns));
        if (uniqueLrns.length > 0) {
            try {
                const existingUsersByLrn = await req.dbAdapter.getUsers({ username: { $in: uniqueLrns } });
                if (existingUsersByLrn && existingUsersByLrn.length > 0) {
                    const existingLrnSet = new Set(existingUsersByLrn.map(u => String(u.username)));
                    normalized.forEach(r => {
                        if (existingLrnSet.has(r.lrn)) {
                            errors.push({ idx: r.idx, studentId: r.studentId || null, issues: ['Username (LRN) already exists in system'] });
                        }
                    });
                }
            } catch (dbErr) {
                console.error('Error checking existing usernames during bulk import validation:', dbErr);
                errors.push({ idx: null, studentId: null, issues: ['Failed to validate existing usernames'] });
            }
        }

        const uniqueStudentIds = Array.from(new Set(studentIds));
        if (uniqueStudentIds.length > 0) {
            try {
                const existingUsersByStudentId = await req.dbAdapter.getUsers({ studentId: { $in: uniqueStudentIds } });
                if (existingUsersByStudentId && existingUsersByStudentId.length > 0) {
                    const existingSidSet = new Set(existingUsersByStudentId.map(u => String(u.studentId)));
                    normalized.forEach(r => {
                        if (existingSidSet.has(r.studentId)) {
                            errors.push({ idx: r.idx, studentId: r.studentId || null, issues: ['studentId already exists in system'] });
                        }
                    });
                }
            } catch (dbErr) {
                console.error('Error checking existing studentIds during bulk import validation:', dbErr);
                errors.push({ idx: null, studentId: null, issues: ['Failed to validate existing studentIds'] });
            }
        }

        // If any validation errors, abort and return consolidated list
        const validationErrorsByIndex = new Map();
        errors.forEach((entry) => {
            if (!validationErrorsByIndex.has(entry.idx)) {
                validationErrorsByIndex.set(entry.idx, []);
            }
            const issues = Array.isArray(entry.issues) ? entry.issues : (entry.errors || []);
            validationErrorsByIndex.get(entry.idx).push(...issues);
        });

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

        for (const [idx, studentData] of students.entries()) {
            try {
                if (validationErrorsByIndex.has(idx)) {
                    const issues = validationErrorsByIndex.get(idx) || ['Validation failed'];
                    results.failed.push({
                        studentData,
                        error: issues.join('; '),
                        issues
                    });
                    continue;
                }

                // Generate library card number for each student
                const libraryCardNumber = await generateLibraryCardNumber(req.dbAdapter);
                const schoolYear = resolveSchoolYear(studentData);

                // Determine username (prefer LRN) and generate default password (first letter + surname preferred)
                const username = studentData.lrn || studentData.username || null;
                let hashedPassword = null;
                if (username) {
                    const firstInitial = (studentData.firstName || '').charAt(0) || '';
                    const surname = (studentData.lastName || '').toString().replace(/\s+/g, '');
                    const rawPassword = surname ? `${firstInitial}${surname}` : `${firstInitial}${username}`;
                    hashedPassword = await bcrypt.hash(rawPassword.toLowerCase(), 10);
                } else if (studentData.password) {
                    // fallback to provided password: if it's already a bcrypt hash, keep it as-is;
                    // otherwise hash the provided plaintext password before storing.
                    const isBcrypt = (p) => typeof p === 'string' && /^\$2[aby]\$/.test(p);
                    if (isBcrypt(studentData.password)) {
                        hashedPassword = studentData.password;
                    } else {
                        hashedPassword = await bcrypt.hash(studentData.password, 10);
                    }
                }

                const newStudent = {
                    ...studentData,
                    username: username,
                    libraryCardNumber: libraryCardNumber, // Auto-generated
                    schoolYear: schoolYear,
                    academicYear: schoolYear,
                    password: hashedPassword,
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

        const successCount = results.successful.length;
        const failureCount = results.failed.length;
        const statusCode = successCount > 0 ? 200 : 400;

        setAuditContext(req, {
            success: successCount > 0,
            status: successCount > 0 ? 'CompletedWithWarnings' : 'ValidationError',
            description: `Imported ${successCount} students (${failureCount} failed)`,
            details: {
                success: successCount,
                errors: failureCount,
            },
            metadata: {
                actorId: req.user.id
            }
        });

        res.status(statusCode).json({
            message: `Bulk import completed. ${successCount} successful, ${failureCount} failed.`,
            results: {
                success: successCount,
                errors: failureCount,
                details: [
                    ...results.successful.map(s => ({
                        studentId: s.studentId,
                        status: 'success',
                        message: 'Imported successfully'
                    })),
                    ...results.failed.map(f => ({
                        studentId: f.studentData.studentId,
                        status: 'error',
                        message: f.error,
                        issues: f.issues || []
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
