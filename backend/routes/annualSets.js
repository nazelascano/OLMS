const express = require('express');
const { verifyToken, requireStaff, logAction, setAuditContext } = require('../middleware/customAuth');
const { generateTransactionId } = require('../utils/transactionIds');

const router = express.Router();

const safeLower = (value) => {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).trim().toLowerCase();
};

const normalizeAcademicYear = (value) => {
    if (!value) {
        const now = new Date();
        const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
        return `${start}-${start + 1}`;
    }

    const trimmed = String(value).trim();
    if (/^\d{4}\s*-\s*\d{4}$/.test(trimmed)) {
        const [start, end] = trimmed.split('-').map(part => part.trim());
        return `${start}-${end}`;
    }

    const numeric = parseInt(trimmed, 10);
    if (!Number.isNaN(numeric) && trimmed.length === 4) {
        return `${numeric}-${numeric + 1}`;
    }

    return trimmed;
};

const normalizeBooks = (books = []) => {
    if (!Array.isArray(books)) {
        return [];
    }

    const map = new Map();

    books.forEach(rawEntry => {
        const entry = rawEntry || {};
        const id = entry.bookId || entry.id || entry._id || entry.isbn;
        if (!id) {
            return;
        }

        const key = String(id).trim();
        if (!key) {
            return;
        }

        const quantity = Math.max(parseInt(entry.quantity, 10) || 1, 1);
        const copyIds = Array.isArray(entry.copyIds)
            ? entry.copyIds.filter(Boolean).map(value => String(value).trim())
            : [];

        const record = map.get(key) || { bookId: key, quantity: 0, copyIds: [], required: true, notes: '' };

        record.quantity += quantity;
        record.required = entry.required === false ? false : record.required;
        record.notes = entry.notes || record.notes;

        if (copyIds.length > 0) {
            const merged = new Set([...(record.copyIds || []), ...copyIds]);
            record.copyIds = Array.from(merged);
        }

        map.set(key, record);
    });

    return Array.from(map.values());
};

const buildBookLookup = (books = []) => {
    const map = new Map();
    books.forEach(book => {
        const key = book.id || book._id || book.bookId || book.isbn;
        if (!key) {
            return;
        }
        map.set(String(key), book);
    });
    return map;
};

const enrichSetsWithBooks = (sets = [], allBooks = [], issueMetrics = new Map()) => {
    const lookup = buildBookLookup(allBooks);

    return sets.map(set => {
        const entries = (set.books || []).map(entry => {
            const book = lookup.get(entry.bookId) || null;

            if (!book) {
                return { ...entry, book: null };
            }

            const totalCopies = Array.isArray(book.copies) ? book.copies.length : 0;
            const availableCopies = Array.isArray(book.copies)
                ? book.copies.filter(copy => copy.status === 'available').length
                : 0;

            return {
                ...entry,
                book: {
                    id: book.id || book._id,
                    title: book.title,
                    author: book.author,
                    isbn: book.isbn,
                    totalCopies,
                    availableCopies
                }
            };
        });

        const stats = {
            totalTitles: entries.length,
            totalRequired: entries.filter(item => item.required !== false).length,
            totalQuantity: entries.reduce((sum, item) => sum + (item.quantity || 0), 0)
        };

        const metrics = issueMetrics.get(set.id) || issueMetrics.get(String(set.id)) || {
            total: 0,
            active: 0
        };

        return {
            ...set,
            books: entries,
            stats,
            issuedCount: metrics.total || 0,
            activeIssues: metrics.active || 0
        };
    });
};

const buildIssueMetrics = (transactions = []) => {
    const map = new Map();

    (transactions || []).forEach(transaction => {
        if (!transaction || !transaction.annualSetId) {
            return;
        }

        const key = String(transaction.annualSetId);
        const entry = map.get(key) || { total: 0, active: 0 };
        entry.total += 1;
        if (transaction.status !== 'returned') {
            entry.active += 1;
        }
        map.set(key, entry);
    });

    return map;
};

const buildAnnualSetDocument = (payload, user) => {
    const now = new Date();

    return {
        id: payload.id || `annual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: (payload.name || '').trim() || 'Untitled Annual Set',
        gradeLevel: (payload.gradeLevel || '').trim(),
        section: (payload.section || '').trim(),
        department: (payload.department || '').trim(),
        academicYear: normalizeAcademicYear(payload.academicYear),
        description: (payload.description || '').trim(),
        books: normalizeBooks(payload.books),
        createdAt: now,
        updatedAt: now,
        createdBy: user?.id || user?._id || null,
        updatedBy: user?.id || user?._id || null
    };
};

const applyEditableFields = (record, payload) => {
    if (payload.name !== undefined) {
        record.name = String(payload.name || '').trim();
    }
    if (payload.gradeLevel !== undefined) {
        record.gradeLevel = String(payload.gradeLevel || '').trim();
    }
    if (payload.section !== undefined) {
        record.section = String(payload.section || '').trim();
    }
    if (payload.department !== undefined) {
        record.department = String(payload.department || '').trim();
    }
    if (payload.academicYear !== undefined) {
        record.academicYear = normalizeAcademicYear(payload.academicYear);
    }
    if (payload.description !== undefined) {
        record.description = String(payload.description || '').trim();
    }
    if (payload.books !== undefined) {
        record.books = normalizeBooks(payload.books);
    }
};

const buildFiltersFromQuery = (query = {}) => {
    const filters = {};

    if (query.academicYear) {
        filters.academicYear = normalizeAcademicYear(query.academicYear);
    }

    if (query.gradeLevel) {
        filters.gradeLevel = String(query.gradeLevel).trim();
    }

    if (query.section) {
        filters.section = String(query.section).trim();
    }

    if (query.department) {
        filters.department = String(query.department).trim();
    }

    return filters;
};

const findMatchingStudents = async(dbAdapter, { gradeLevel, section, department }) => {
    const students = await dbAdapter.findInCollection('users', { role: 'student' });

    const normalizedGrade = safeLower(gradeLevel);
    const normalizedSection = safeLower(section);
    const normalizedDepartment = safeLower(department);

    return (students || []).filter(student => {
        if (!student || student.isActive === false) {
            return false;
        }

        if (normalizedGrade) {
            const studentGrade = safeLower(student.grade || student.gradeLevel || student.profile?.gradeLevel);
            if (studentGrade !== normalizedGrade) {
                return false;
            }
        }

        if (normalizedSection) {
            const studentSection = safeLower(student.section || student.sectionName || student.profile?.section);
            if (studentSection !== normalizedSection) {
                return false;
            }
        }

        if (normalizedDepartment) {
            const studentDepartment = safeLower(student.department || student.profile?.department || student.academic?.department);
            if (studentDepartment !== normalizedDepartment) {
                return false;
            }
        }

        return true;
    });
};

const findUserByAnyIdentifier = async(dbAdapter, identifier) => {
    if (identifier === null || identifier === undefined) {
        return null;
    }

    const normalized = String(identifier).trim();
    if (!normalized) {
        return null;
    }

    const searchFields = [
        'id',
        '_id',
        'userId',
        'studentId',
        'libraryCardNumber',
        'library.cardNumber',
        'profile.studentId',
        'lrn'
    ];

    for (const field of searchFields) {
        const query = {};
        query[field] = normalized;
        const user = await dbAdapter.findOneInCollection('users', query);
        if (user) {
            return user;
        }
    }

    return null;
};

router.get('/', verifyToken, requireStaff, async(req, res) => {
    try {
        const { search } = req.query || {};
        const filters = buildFiltersFromQuery(req.query || {});

        let sets = await req.dbAdapter.findInCollection('annualSets', filters);

        if (search) {
            const needle = safeLower(search);
            sets = (sets || []).filter(set => {
                return [
                    set.name,
                    set.description,
                    set.gradeLevel,
                    set.section,
                    set.academicYear
                ].some(value => safeLower(value).includes(needle));
            });
        }

        sets.sort((a, b) => {
            const yearCompare = String(a.academicYear || '').localeCompare(String(b.academicYear || ''));
            if (yearCompare !== 0) {
                return yearCompare;
            }
            const gradeCompare = String(a.gradeLevel || '').localeCompare(String(b.gradeLevel || ''));
            if (gradeCompare !== 0) {
                return gradeCompare;
            }
            return String(a.section || '').localeCompare(String(b.section || ''));
        });

    const books = await req.dbAdapter.findInCollection('books', {});
    const transactions = await req.dbAdapter.findInCollection('transactions', {});
    const issueMetrics = buildIssueMetrics(transactions);
    const enriched = enrichSetsWithBooks(sets, books, issueMetrics);

        res.json(enriched);
    } catch (error) {
        console.error('Annual sets list error:', error);
        res.status(500).json({ message: 'Failed to fetch annual borrowing sets' });
    }
});

router.post('/preview', verifyToken, requireStaff, async(req, res) => {
    try {
        const { academicYear, gradeLevel, section, department, setId } = req.body || {};

        let targetSet = null;

        if (setId) {
            targetSet = await req.dbAdapter.findOneInCollection('annualSets', { id: setId });
            if (!targetSet) {
                return res.status(404).json({ message: 'Annual set not found for preview' });
            }
        }

        if (!targetSet) {
            const filters = buildFiltersFromQuery({ academicYear, gradeLevel, section, department });
            const sets = await req.dbAdapter.findInCollection('annualSets', filters);
            targetSet = Array.isArray(sets) && sets.length > 0 ? sets[0] : null;
        }

        if (!targetSet) {
            return res.status(404).json({ message: 'No annual set matches the preview filters' });
        }

        const students = await findMatchingStudents(req.dbAdapter, {
            gradeLevel: gradeLevel || targetSet.gradeLevel,
            section: section || targetSet.section,
            department: department || targetSet.department
        });

        const books = await req.dbAdapter.findInCollection('books', {});
        const allTransactions = await req.dbAdapter.findInCollection('transactions', {});
        const metrics = buildIssueMetrics(allTransactions.filter(txn => String(txn.annualSetId || '') === String(targetSet.id)));
        const [enriched] = enrichSetsWithBooks([targetSet], books, metrics);

        res.json({
            academicYear: enriched.academicYear,
            gradeLevel: enriched.gradeLevel,
            section: enriched.section,
            department: enriched.department,
            targetSet: enriched,
            studentCount: students.length,
            studentSample: students.slice(0, 10).map(student => ({
                id: student.id || student._id,
                name: student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                grade: student.grade || student.gradeLevel || student.profile?.gradeLevel || '',
                section: student.section || student.profile?.section || '',
                department: student.department || student.profile?.department || ''
            }))
        });
    } catch (error) {
        console.error('Annual plan preview error:', error);
        res.status(500).json({ message: 'Failed to generate annual plan preview' });
    }
});

router.get('/:id/issue-context', verifyToken, requireStaff, async(req, res) => {
    try {
        const set = await req.dbAdapter.findOneInCollection('annualSets', { id: req.params.id });

        if (!set) {
            return res.status(404).json({ message: 'Annual set not found' });
        }

        const books = await req.dbAdapter.findInCollection('books', {});
        const allTransactions = await req.dbAdapter.findInCollection('transactions', {});
        const metrics = buildIssueMetrics(allTransactions.filter(txn => String(txn.annualSetId || '') === String(set.id)));
        const [enriched] = enrichSetsWithBooks([set], books, metrics);

        const activeBorrowerIds = new Set();
        (allTransactions || []).forEach(txn => {
            if (String(txn.annualSetId || '') === String(set.id) && txn.status !== 'returned') {
                activeBorrowerIds.add(String(txn.userId));
            }
        });

        const entries = (set.books || []).map((entry, index) => {
            const quantity = Math.max(parseInt(entry.quantity, 10) || 1, 1);
            const allowedCopyIds = Array.isArray(entry.copyIds) && entry.copyIds.length > 0
                ? new Set(entry.copyIds.map(value => String(value)))
                : null;

            const bookRecord = books.find(book => {
                const identifiers = [book.id, book._id, book.bookId, book.isbn]
                    .filter(Boolean)
                    .map(value => String(value));
                return identifiers.includes(String(entry.bookId));
            }) || null;

            const availableCopies = Array.isArray(bookRecord?.copies)
                ? bookRecord.copies.filter(copy => {
                    if (!copy || copy.status !== 'available') {
                        return false;
                    }
                    if (allowedCopyIds && !allowedCopyIds.has(String(copy.copyId))) {
                        return false;
                    }
                    return true;
                })
                : [];

            const copyOptions = availableCopies.map(copy => ({
                copyId: copy.copyId,
                condition: copy.condition || '',
                location: copy.location || '',
                status: copy.status,
                updatedAt: copy.updatedAt || null
            }));

            const suggestedCopies = copyOptions.slice(0, quantity).map(option => option.copyId);

            return {
                entryKey: `${set.id}_${index}`,
                bookId: bookRecord?.id || bookRecord?._id || entry.bookId,
                quantity,
                required: entry.required !== false,
                notes: entry.notes || '',
                book: bookRecord
                    ? {
                        id: bookRecord.id || bookRecord._id,
                        title: bookRecord.title,
                        author: bookRecord.author,
                        isbn: bookRecord.isbn,
                        totalCopies: bookRecord.totalCopies || (bookRecord.copies ? bookRecord.copies.length : 0),
                        availableCopies: copyOptions.length
                    }
                    : {
                        id: entry.bookId,
                        title: entry.bookId,
                        author: '',
                        isbn: ''
                    },
                availableCopies: copyOptions,
                suggestedCopies,
                shortage: Math.max(0, quantity - copyOptions.length)
            };
        });

        const matchingStudents = await findMatchingStudents(req.dbAdapter, {
            gradeLevel: enriched.gradeLevel,
            section: enriched.section,
            department: enriched.department
        });

        const { q } = req.query || {};
        let students = Array.isArray(matchingStudents) ? matchingStudents : [];

        if (q) {
            const needle = safeLower(q);
            students = students.filter(student => {
                const name = safeLower(student.fullName || `${student.firstName || ''} ${student.lastName || ''}`);
                const identifiers = [
                    student.id,
                    student._id,
                    student.studentId,
                    student.libraryCardNumber,
                    student.library?.cardNumber,
                    student.lrn,
                    student.email,
                    student.username
                ]
                    .filter(Boolean)
                    .map(value => safeLower(value));

                if (name.includes(needle)) {
                    return true;
                }

                return identifiers.some(idValue => idValue.includes(needle));
            });
        }

        const studentSummaries = students
            .slice(0, 150)
            .map(student => {
                const identifier = String(student.id || student._id || student.studentId || student.libraryCardNumber || '');
                return {
                    id: identifier,
                    name: student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username || student.email || 'Unnamed student',
                    grade: student.grade || student.gradeLevel || student.profile?.gradeLevel || '',
                    section: student.section || student.sectionName || student.profile?.section || '',
                    department: student.department || student.profile?.department || '',
                    libraryCardNumber: student.libraryCardNumber || student.library?.cardNumber || '',
                    email: student.email || '',
                    isActive: student.isActive !== false,
                    hasActiveBorrowing: activeBorrowerIds.has(identifier)
                };
            })
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        res.json({
            set: enriched,
            entries,
            students: studentSummaries,
            metrics: {
                issuedCount: enriched.issuedCount || 0,
                activeIssues: enriched.activeIssues || 0
            }
        });
    } catch (error) {
        console.error('Annual set issue context error:', error);
        res.status(500).json({ message: 'Failed to load annual set issuance data' });
    }
});

router.get('/:id', verifyToken, requireStaff, async(req, res) => {
    try {
        const set = await req.dbAdapter.findOneInCollection('annualSets', { id: req.params.id });

        if (!set) {
            return res.status(404).json({ message: 'Annual set not found' });
        }

    const books = await req.dbAdapter.findInCollection('books', {});
    const allTransactions = await req.dbAdapter.findInCollection('transactions', {});
    const metrics = buildIssueMetrics(allTransactions.filter(txn => String(txn.annualSetId || '') === String(set.id)));
    const [enriched] = enrichSetsWithBooks([set], books, metrics);

        res.json(enriched);
    } catch (error) {
        console.error('Annual set detail error:', error);
        res.status(500).json({ message: 'Failed to fetch annual set' });
    }
});

router.post('/:id/issue', verifyToken, requireStaff, logAction('BORROW', 'annual_set'), async(req, res) => {
    try {
    const { studentId, items = [], notes = '', allowPartial = false, dueDate } = req.body || {};
    const sanitizedNotes = typeof notes === 'string' ? notes : '';

        setAuditContext(req, {
            entityId: req.params.id,
            metadata: {
                issueRequest: {
                    studentId: studentId || null,
                    itemsRequested: Array.isArray(items) ? items.length : 0,
                    allowPartial,
                    dueDate: dueDate || null
                }
            },
            details: {
                notes: sanitizedNotes
            }
        });

        const recordFailure = (status, description, context = {}) => {
            setAuditContext(req, {
                success: false,
                status,
                description,
                ...(context.metadata ? { metadata: context.metadata } : {}),
                ...(context.details ? { details: context.details } : {})
            });
        };

        if (!studentId) {
            recordFailure('ValidationError', 'Annual set issuance failed: studentId is required');
            return res.status(400).json({ message: 'studentId is required' });
        }

        const set = await req.dbAdapter.findOneInCollection('annualSets', { id: req.params.id });
        if (!set) {
            recordFailure('SetNotFound', `Annual set issuance failed: set ${req.params.id} not found`);
            return res.status(404).json({ message: 'Annual set not found' });
        }

        if (!Array.isArray(set.books) || set.books.length === 0) {
            recordFailure('ValidationError', 'Annual set issuance failed: set has no books');
            return res.status(400).json({ message: 'Annual set does not contain any books' });
        }

        let student = await req.dbAdapter.findUserById(studentId);
        if (!student) {
            student = await findUserByAnyIdentifier(req.dbAdapter, studentId);
        }

        if (!student) {
            recordFailure('StudentNotFound', `Annual set issuance failed: student ${studentId} not found`);
            return res.status(404).json({ message: 'Student not found' });
        }

        if (student.role && student.role !== 'student') {
            recordFailure('ValidationError', 'Annual set issuance failed: selected user is not a student');
            return res.status(400).json({ message: 'Selected user is not a student' });
        }

        if (student.isActive === false) {
            recordFailure('ValidationError', 'Annual set issuance failed: student account inactive');
            return res.status(400).json({ message: 'Student account is inactive' });
        }

        const allTransactions = await req.dbAdapter.findInCollection('transactions', {});
        const hasActiveBorrowing = (allTransactions || []).some(txn => {
            if (!txn || txn.status === 'returned') {
                return false;
            }
            return String(txn.annualSetId || '') === String(set.id) && String(txn.userId || '') === String(student.id || student._id || '');
        });

        if (hasActiveBorrowing) {
            recordFailure('Conflict', 'Annual set issuance failed: student already has active borrowing');
            return res.status(400).json({ message: 'Student already has an active borrowing for this annual set' });
        }

        const books = await req.dbAdapter.findInCollection('books', {});
        if (!Array.isArray(books) || books.length === 0) {
            recordFailure('ValidationError', 'Annual set issuance failed: no books available in catalogue');
            return res.status(400).json({ message: 'No books found in catalogue' });
        }

        const bookLookup = new Map();
        books.forEach(book => {
            if (!book) {
                return;
            }
            [book.id, book._id, book.bookId, book.isbn]
                .filter(Boolean)
                .map(value => String(value))
                .forEach(key => {
                    if (!bookLookup.has(key)) {
                        bookLookup.set(key, book);
                    }
                });
        });

        const providedItems = Array.isArray(items)
            ? items
                .filter(item => item && item.bookId && item.copyId)
                .map(item => ({
                    bookId: String(item.bookId),
                    copyId: String(item.copyId)
                }))
            : [];

        const providedMap = new Map();
        providedItems.forEach(item => {
            const list = providedMap.get(item.bookId) || [];
            list.push(item.copyId);
            providedMap.set(item.bookId, list);
        });

        const assignments = [];
        const errors = [];
        const actorId = req.user?.id || req.user?._id || null;
        const usedCopyIds = new Set();

        for (let index = 0; index < set.books.length; index += 1) {
            const entry = set.books[index] || {};
            const baseQuantity = Math.max(parseInt(entry.quantity, 10) || 1, 1);
            const quantity = baseQuantity;
            const allowedCopyIds = Array.isArray(entry.copyIds) && entry.copyIds.length > 0
                ? new Set(entry.copyIds.map(value => String(value)))
                : null;

            const book = bookLookup.get(String(entry.bookId));
            if (!book) {
                if (entry.required !== false) {
                    errors.push(`Book not found for entry index ${index + 1}`);
                }
                continue;
            }

            const candidates = Array.isArray(book.copies)
                ? book.copies.filter(copy => {
                    if (!copy || copy.status !== 'available') {
                        return false;
                    }
                    if (allowedCopyIds && !allowedCopyIds.has(String(copy.copyId))) {
                        return false;
                    }
                    return true;
                })
                : [];

            const entryAssignments = [];
            const availableQueue = [...candidates];
            const identifierCandidates = [
                String(entry.bookId),
                String(book.id || ''),
                String(book._id || ''),
                String(book.bookId || ''),
                String(book.isbn || '')
            ].filter(Boolean);

            const providedForEntry = [];
            identifierCandidates.forEach(key => {
                if (providedMap.has(key)) {
                    providedForEntry.push(...providedMap.get(key));
                    providedMap.delete(key);
                }
            });

            const invalidProvided = [];

            providedForEntry.forEach(copyId => {
                const idx = availableQueue.findIndex(copy => String(copy.copyId) === copyId);
                if (idx === -1) {
                    invalidProvided.push(copyId);
                    return;
                }

                const copy = availableQueue.splice(idx, 1)[0];
                if (usedCopyIds.has(String(copy.copyId))) {
                    invalidProvided.push(copy.copyId);
                    return;
                }

                entryAssignments.push({ book, copy, entry });
                usedCopyIds.add(String(copy.copyId));
            });

            if (invalidProvided.length > 0) {
                errors.push(`Selected copy ${invalidProvided[0]} is not available for ${book.title || entry.bookId}`);
            }

            while (entryAssignments.length < quantity && availableQueue.length > 0) {
                const copy = availableQueue.shift();
                if (!copy) {
                    break;
                }
                if (usedCopyIds.has(String(copy.copyId))) {
                    continue;
                }
                entryAssignments.push({ book, copy, entry });
                usedCopyIds.add(String(copy.copyId));
            }

            if (entryAssignments.length < quantity) {
                if (entry.required !== false && !allowPartial) {
                    errors.push(`Not enough available copies for ${book.title || entry.bookId}`);
                }
            }

            assignments.push(...entryAssignments);
        }

        if (errors.length > 0) {
            recordFailure('ValidationError', `Annual set issuance failed: ${errors[0]}`, { details: { errors } });
            return res.status(400).json({
                message: errors[0],
                details: errors
            });
        }

        if (assignments.length === 0) {
            recordFailure('ValidationError', 'Annual set issuance failed: no copies assigned');
            return res.status(400).json({ message: 'No book copies could be assigned' });
        }

        const borrowDate = new Date();
        const providedDueDate = dueDate ? new Date(dueDate) : null;
        const dueDateValue = null;

        const updatesByBook = new Map();
        assignments.forEach(assignment => {
            const book = assignment.book;
            const key = String(book.id || book._id);
            const record = updatesByBook.get(key) || { book, copyIds: [] };
            record.copyIds.push(String(assignment.copy.copyId));
            updatesByBook.set(key, record);
        });

        const transactionItems = [];

        for (const record of updatesByBook.values()) {
            const { book, copyIds } = record;
            const updatedCopies = (book.copies || []).map(copy => {
                if (copyIds.includes(String(copy.copyId))) {
                    return {
                        ...copy,
                        status: 'borrowed',
                        updatedAt: new Date(),
                        updatedBy: actorId
                    };
                }
                return copy;
            });

            const bookQuery = book.id ? { id: book.id } : { _id: book._id };
            await req.dbAdapter.updateInCollection('books', bookQuery, {
                copies: updatedCopies,
                availableCopies: updatedCopies.filter(copy => copy.status === 'available').length,
                updatedAt: new Date()
            });

            copyIds.forEach(copyId => {
                transactionItems.push({
                    copyId,
                    bookId: book.id || book._id,
                    isbn: book.isbn,
                    status: 'borrowed'
                });
            });
        }

    const transactionId = generateTransactionId('annual');
        const studentIdentifier = student.id || student._id;

        const transactionData = {
            id: transactionId,
            userId: studentIdentifier,
            items: transactionItems,
            type: 'annual-set',
            status: 'borrowed',
            borrowDate,
            dueDate: dueDateValue,
            returnDate: null,
            fineAmount: 0,
            notes: sanitizedNotes,
            renewalCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: actorId,
            annualSetId: set.id,
            annualSetName: set.name || '',
            metadata: {
                academicYear: set.academicYear || '',
                gradeLevel: set.gradeLevel || '',
                section: set.section || '',
                department: set.department || '',
                providedDueDate: providedDueDate && !Number.isNaN(providedDueDate.getTime()) ? providedDueDate.toISOString() : null
            }
        };

        await req.dbAdapter.insertIntoCollection('transactions', transactionData);

        const stats = student.borrowingStats || {};
        const updatedStats = {
            totalBorrowed: (stats.totalBorrowed || 0) + transactionItems.length,
            currentlyBorrowed: (stats.currentlyBorrowed || 0) + transactionItems.length,
            totalFines: stats.totalFines || 0,
            totalReturned: stats.totalReturned || 0
        };

        const userQuery = student.id ? { id: student.id } : { _id: student._id };
        await req.dbAdapter.updateInCollection('users', userQuery, {
            borrowingStats: updatedStats,
            updatedAt: new Date()
        });

        const updatedTransactions = await req.dbAdapter.findInCollection('transactions', {});
        const metrics = buildIssueMetrics(updatedTransactions.filter(txn => String(txn.annualSetId || '') === String(set.id)));
        const metricEntry = metrics.get(String(set.id)) || { total: 0, active: 0 };

        await req.dbAdapter.updateInCollection('annualSets', { id: set.id }, {
            updatedAt: new Date(),
            updatedBy: actorId
        });

        setAuditContext(req, {
            success: true,
            status: 'Issued',
            entityId: set.id,
            resourceId: transactionId,
            description: `Issued annual set ${set.name || set.id} to student ${studentIdentifier}`,
            metadata: {
                actorId,
                transactionId,
                assignedCopies: transactionItems.length,
                dueDate: null,
                providedDueDate: providedDueDate && !Number.isNaN(providedDueDate.getTime()) ? providedDueDate.toISOString() : null
            },
            details: {
                student: {
                    id: studentIdentifier,
                    name: student.firstName ? `${student.firstName} ${student.lastName || ''}`.trim() : student.username || student.email || ''
                },
                items: transactionItems
            }
        });

        res.status(201).json({
            message: 'Annual set issued successfully',
            transaction: {
                id: transactionData.id,
                borrowDate: transactionData.borrowDate,
                dueDate: transactionData.dueDate,
                items: transactionData.items
            },
            issuedCount: metricEntry.total || 0,
            activeIssues: metricEntry.active || 0
        });
    } catch (error) {
        console.error('Annual set issue error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Annual set issuance failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to issue annual set to student' });
    }
});

router.post('/', verifyToken, requireStaff, logAction('CREATE', 'annual_set'), async(req, res) => {
    try {
        const payload = req.body || {};

        setAuditContext(req, {
            metadata: {
                createRequest: {
                    name: payload.name || null,
                    academicYear: payload.academicYear || null,
                    gradeLevel: payload.gradeLevel || null,
                    section: payload.section || null,
                    bookCount: Array.isArray(payload.books) ? payload.books.length : 0
                }
            }
        });

        const fail = (status, description) => {
            setAuditContext(req, {
                success: false,
                status,
                description
            });
        };

        if (!payload.gradeLevel) {
            fail('ValidationError', 'Annual set creation failed: gradeLevel is required');
            return res.status(400).json({ message: 'gradeLevel is required' });
        }

        if (!Array.isArray(payload.books) || payload.books.length === 0) {
            fail('ValidationError', 'Annual set creation failed: at least one book required');
            return res.status(400).json({ message: 'At least one book is required for the annual set' });
        }

        const document = buildAnnualSetDocument(payload, req.user || {});
        await req.dbAdapter.insertIntoCollection('annualSets', document);

    const books = await req.dbAdapter.findInCollection('books', {});
    const [enriched] = enrichSetsWithBooks([document], books, new Map());

        setAuditContext(req, {
            success: true,
            status: 'Created',
            entityId: document.id,
            resourceId: document.id,
            description: `Created annual set ${document.name || document.id}`,
            metadata: {
                actorId: req.user?.id || req.user?._id || null,
                bookCount: document.books ?.length || 0
            }
        });

        res.status(201).json(enriched);
    } catch (error) {
        console.error('Annual set create error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Annual set creation failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to create annual borrowing set' });
    }
});

router.put('/:id', verifyToken, requireStaff, logAction('UPDATE', 'annual_set'), async(req, res) => {
    try {
        setAuditContext(req, {
            entityId: req.params.id,
            metadata: {
                updateRequest: {
                    setId: req.params.id,
                    fields: Object.keys(req.body || {})
                }
            }
        });
        const existing = await req.dbAdapter.findOneInCollection('annualSets', { id: req.params.id });

        if (!existing) {
            setAuditContext(req, {
                success: false,
                status: 'SetNotFound',
                description: `Annual set update failed: set ${req.params.id} not found`
            });
            return res.status(404).json({ message: 'Annual set not found' });
        }

        applyEditableFields(existing, req.body || {});
        existing.updatedAt = new Date();
        existing.updatedBy = req.user?.id || req.user?._id || existing.updatedBy || null;

        await req.dbAdapter.updateInCollection('annualSets', { id: req.params.id }, existing);

    const books = await req.dbAdapter.findInCollection('books', {});
    const allTransactions = await req.dbAdapter.findInCollection('transactions', {});
    const metrics = buildIssueMetrics(allTransactions.filter(txn => String(txn.annualSetId || '') === String(existing.id)));
    const [enriched] = enrichSetsWithBooks([existing], books, metrics);

        setAuditContext(req, {
            success: true,
            status: 'Updated',
            entityId: req.params.id,
            resourceId: req.params.id,
            description: `Updated annual set ${existing.name || req.params.id}`,
            metadata: {
                actorId: req.user?.id || req.user?._id || null
            }
        });

        res.json(enriched);
    } catch (error) {
        console.error('Annual set update error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Annual set update failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to update annual borrowing set' });
    }
});

router.delete('/:id', verifyToken, requireStaff, logAction('DELETE', 'annual_set'), async(req, res) => {
    try {
        setAuditContext(req, {
            entityId: req.params.id
        });
        const existing = await req.dbAdapter.findOneInCollection('annualSets', { id: req.params.id });

        if (!existing) {
            setAuditContext(req, {
                success: false,
                status: 'SetNotFound',
                description: `Annual set deletion failed: set ${req.params.id} not found`
            });
            return res.status(404).json({ message: 'Annual set not found' });
        }

        await req.dbAdapter.deleteFromCollection('annualSets', { id: req.params.id });

        setAuditContext(req, {
            success: true,
            status: 'Deleted',
            entityId: req.params.id,
            resourceId: req.params.id,
            description: `Deleted annual set ${existing.name || req.params.id}`,
            metadata: {
                actorId: req.user?.id || req.user?._id || null
            }
        });

        res.json({ message: 'Annual set removed successfully' });
    } catch (error) {
        console.error('Annual set delete error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Annual set deletion failed: ${error.message}`,
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to remove annual borrowing set' });
    }
});

module.exports = router;
