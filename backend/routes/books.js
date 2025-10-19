const express = require('express');
const { verifyToken, requireStaff, requireLibrarian, logAction, setAuditContext } = require('../middleware/customAuth');
const router = express.Router();

const generateCopyId = (isbn) => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 4);
    return `${isbn}-${timestamp}-${random}`.toUpperCase();
};

const normalizeStatus = (status) => {
    if (!status) return 'pending';
    return status === 'borrowed' ? 'active' : status;
};

const buildLookupMap = (records, keysResolver) => {
    const map = new Map();
    records.forEach(record => {
        const keys = keysResolver(record) || [];
        keys.filter(Boolean).forEach(key => {
            map.set(String(key).toLowerCase(), record);
        });
    });
    return map;
};

const getBorrowerName = (user) => {
    if (!user) return 'Unknown Borrower';
    if (user.fullName) return user.fullName;
    const nameParts = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ').trim();
    if (nameParts) return nameParts;
    return user.username || user.email || 'Unknown Borrower';
};

const normalizeString = (value) => {
    if (!value) return '';
    return String(value).toLowerCase();
};

const matchesBookSearch = (book, term) => {
    if (!term) return true;
    const searchTerm = normalizeString(term);
    const fields = [
        book.title,
        book.author,
        book.isbn,
        book.publisher,
        book.category,
        book.description
    ];

    return fields.some((field) => normalizeString(field).includes(searchTerm));
};

const buildBookSummary = (book) => {
    const copies = Array.isArray(book.copies) ? book.copies : [];
    const availableCopies = copies.filter((copy) => normalizeString(copy.status) === 'available');
    const primaryId = book.id || book._id;

    if (!primaryId) {
        return null;
    }

    return {
        id: String(primaryId),
        _id: book._id,
        title: book.title || 'Untitled',
        author: book.author || 'Unknown Author',
        isbn: book.isbn || '',
        category: book.category || '',
        publisher: book.publisher || '',
        publishedYear: book.publishedYear || book.publicationYear || null,
        availableCopies: availableCopies.length,
        totalCopies: copies.length,
        copies,
    };
};

router.get('/', verifyToken, async(req, res) => {
    try {
        const { page = 1, limit = 20, search, category, status, sortBy = 'title', sortOrder = 'asc' } = req.query;
        let filters = {};
        if (category) filters.category = category;
        if (status) filters.status = status;
        let books = await req.dbAdapter.findInCollection('books', filters);
        if (search) {
            const searchLower = search.toLowerCase();
            books = books.filter(book => book.title ?.toLowerCase().includes(searchLower) || book.author ?.toLowerCase().includes(searchLower) || book.isbn ?.toLowerCase().includes(searchLower) || book.publisher ?.toLowerCase().includes(searchLower));
        }
        books.sort((a, b) => {
            const aVal = a[sortBy] || '';
            const bVal = b[sortBy] || '';
            if (sortOrder === 'desc') return String(bVal).localeCompare(String(aVal));
            return String(aVal).localeCompare(String(bVal));
        });
        const totalBooks = books.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedBooks = books.slice(startIndex, endIndex);
        const booksWithCopies = paginatedBooks.map(book => ({...book, copiesCount: book.copies ?.length || 0, availableCopiesCount: book.copies ?.filter(c => c.status === 'available').length || 0 }));
        res.json({ books: booksWithCopies, pagination: { currentPage: parseInt(page), totalPages: Math.ceil(totalBooks / limit), totalBooks, hasMore: endIndex < totalBooks } });
    } catch (error) {
        console.error('Get books error:', error);
        res.status(500).json({ message: 'Failed to fetch books' });
    }
});

router.get('/search', verifyToken, requireStaff, async(req, res) => {
    try {
        const {
            q = '',
                available,
                limit = 20
        } = req.query;

        const searchTerm = String(q || '').trim();
        if (!searchTerm) {
            return res.json([]);
        }

        const books = await req.dbAdapter.findInCollection('books', {});
        const onlyAvailable = String(available).toLowerCase() === 'true';
        const limitNumber = Math.max(parseInt(limit, 10) || 20, 1);

        const results = books
            .filter((book) => matchesBookSearch(book, searchTerm))
            .filter((book) => {
                if (!onlyAvailable) return true;
                const copies = Array.isArray(book.copies) ? book.copies : [];
                return copies.some((copy) => normalizeString(copy.status) === 'available');
            })
            .sort((a, b) => {
                const dateA = new Date(a.updatedAt || a.createdAt || 0);
                const dateB = new Date(b.updatedAt || b.createdAt || 0);
                return dateB - dateA;
            })
            .slice(0, limitNumber)
            .map(buildBookSummary)
            .filter(Boolean)
            .map((book) => ({
                ...book,
                copies: book.copies?.map((copy) => ({
                    copyId: copy.copyId,
                    status: copy.status,
                    condition: copy.condition,
                    location: copy.location,
                })) || []
            }));

        res.json(results);
    } catch (error) {
        console.error('Search books error:', error);
        res.status(500).json({ message: 'Failed to search books' });
    }
});

router.post('/bulk-import', verifyToken, requireStaff, logAction('BULK_IMPORT', 'books'), async(req, res) => {
    try {
        const { books } = req.body;
        if (!Array.isArray(books) || books.length === 0) {
            return res.status(400).json({ message: 'Books array is required' });
        }

        const allExistingBooks = await req.dbAdapter.findInCollection('books', {});
        const existingBooksByIsbn = new Map(
            allExistingBooks.map(book => [(book.isbn || '').toLowerCase(), book])
        );

        const results = { successful: [], failed: [] };

        for (const bookData of books) {
            try {
                const rawTitle = bookData.title ?.trim();
                const rawAuthor = bookData.author ?.trim();
                const isbn = bookData.isbn ?.trim();

                if (!isbn) {
                    throw new Error('ISBN is required');
                }

                const normalizedIsbn = isbn.toLowerCase();

                const numberOfCopies = Math.max(parseInt(bookData.numberOfCopies, 10) || 1, 1);
                const location = bookData.location || 'main-library';

                const existingBook = existingBooksByIsbn.get(normalizedIsbn);
                if (existingBook) {
                    const copies = Array.from({ length: numberOfCopies }, () => ({
                        copyId: generateCopyId(isbn),
                        status: 'available',
                        condition: 'good',
                        location,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        createdBy: req.user.id
                    }));

                    const updatedCopies = [...(existingBook.copies || []), ...copies];
                    const availableCopies = updatedCopies.filter(c => c.status === 'available').length;
                    const updatePayload = {
                        copies: updatedCopies,
                        totalCopies: updatedCopies.length,
                        availableCopies,
                        updatedAt: new Date(),
                        updatedBy: req.user.id
                    };

                    await req.dbAdapter.updateInCollection('books', { id: existingBook.id }, updatePayload);

                    existingBooksByIsbn.set(normalizedIsbn, {
                        ...existingBook,
                        ...updatePayload
                    });

                    results.successful.push({
                        isbn,
                        title: rawTitle || existingBook.title || 'Untitled',
                        message: `Added ${numberOfCopies} copies to existing book`
                    });
                    continue;
                }

                const title = rawTitle;
                const author = rawAuthor;

                if (!title || !author) {
                    throw new Error('Title and author are required for new books');
                }

                const bookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                const copies = [];
                for (let i = 0; i < numberOfCopies; i++) {
                    const copyId = generateCopyId(isbn);
                    copies.push({
                        copyId,
                        status: 'available',
                        condition: 'good',
                        location,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        createdBy: req.user.id
                    });
                }

                const publishedYear = bookData.publishedYear ? parseInt(bookData.publishedYear, 10) : null;
                if (bookData.publishedYear && (Number.isNaN(publishedYear) || `${publishedYear}`.length !== 4)) {
                    throw new Error(`Invalid published year for ISBN ${isbn}`);
                }

                const newBook = {
                    id: bookId,
                    title,
                    author,
                    isbn,
                    publisher: bookData.publisher || '',
                    publishedYear,
                    category: bookData.category || 'General',
                    description: bookData.description || '',
                    coverImage: bookData.coverImage || '',
                    status: 'active',
                    totalCopies: numberOfCopies,
                    availableCopies: numberOfCopies,
                    copies,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: req.user.id
                };

                await req.dbAdapter.insertIntoCollection('books', newBook);
                existingBooksByIsbn.set(normalizedIsbn, newBook);
                results.successful.push({ isbn, title, message: 'Imported successfully' });
            } catch (error) {
                results.failed.push({
                    isbn: bookData.isbn,
                    title: bookData.title,
                    message: error.message
                });
            }
        }

        setAuditContext(req, {
            description: `Bulk imported ${results.successful.length} books (${results.failed.length} failed)`,
            details: {
                success: results.successful.length,
                errors: results.failed.length,
            },
        });

        res.json({
            message: `Bulk import completed. ${results.successful.length} successful, ${results.failed.length} failed.`,
            results: {
                success: results.successful.length,
                errors: results.failed.length,
                details: [
                    ...results.successful.map(book => ({
                        isbn: book.isbn,
                        title: book.title,
                        status: 'success',
                        message: book.message || 'Imported successfully'
                    })),
                    ...results.failed.map(book => ({
                        isbn: book.isbn,
                        title: book.title,
                        status: 'error',
                        message: book.message
                    }))
                ]
            }
        });
    } catch (error) {
        console.error('Bulk import books error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Failed',
            description: 'Bulk book import failed',
            details: { error: error.message },
        });
        res.status(500).json({ message: 'Failed to import books' });
    }
});

// Get all categories - MUST be before /:id route
router.get('/categories', verifyToken, async(req, res) => {
    try {
        const allBooks = await req.dbAdapter.findInCollection('books', {});
        const categories = new Set();
        allBooks.forEach(book => { if (book.category) categories.add(book.category); });
        res.json(Array.from(categories).sort());
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ message: 'Failed to fetch categories' });
    }
});

router.get('/:id', verifyToken, async(req, res) => {
    try {
        const book = await req.dbAdapter.findOneInCollection('books', { id: req.params.id });
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'Failed',
                description: `Update book failed: book ${req.params.id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }
        book.copiesCount = book.copies ?.length || 0;
        book.availableCopiesCount = book.copies ?.filter(c => c.status === 'available').length || 0;
        res.json(book);
    } catch (error) {
        console.error('Get book error:', error);
        res.status(500).json({ message: 'Failed to fetch book' });
    }
});


router.post('/', verifyToken, requireStaff, logAction('CREATE', 'book'), async(req, res) => {
    try {
        const {
            title,
            author,
            isbn,
            publisher,
            publishedYear,
            category,
            description,
            coverImage,
            numberOfCopies = 1,
            location = 'main-library',
            copies: incomingCopies = [],
            status = 'active',
            language,
            pages,
            deweyDecimal,
            publicationDate
        } = req.body;

        setAuditContext(req, {
            metadata: {
                createRequest: {
                    isbn: isbn || null,
                    title: title || null,
                    author: author || null,
                    incomingCopies: Array.isArray(incomingCopies) ? incomingCopies.length : 0,
                    numberOfCopies: numberOfCopies
                }
            }
        });

        if (!isbn) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Create book failed: ISBN is required',
            });
            return res.status(400).json({ message: 'ISBN is required' });
        }

        const computePublishedYear = (explicitYear, dateValue) => {
            if (explicitYear !== undefined && explicitYear !== null && String(explicitYear).trim() !== '') {
                const parsedYear = parseInt(explicitYear, 10);
                if (Number.isNaN(parsedYear) || `${parsedYear}`.length !== 4) {
                    throw new Error('Invalid published year');
                }
                return { shouldUpdate: true, value: parsedYear };
            }

            if (dateValue) {
                const parsedDate = new Date(dateValue);
                if (!Number.isNaN(parsedDate.getTime())) {
                    return { shouldUpdate: true, value: parsedDate.getFullYear() };
                }
            }

            return { shouldUpdate: false };
        };

        const sanitizedPages = pages !== undefined && pages !== null && `${pages}`.trim() !== '' ? parseInt(pages, 10) : null;
        if (sanitizedPages !== null && Number.isNaN(sanitizedPages)) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Create book failed: invalid page count',
                metadata: {
                    pages
                }
            });
            return res.status(400).json({ message: 'Invalid number of pages' });
        }

        const publishedYearMeta = computePublishedYear(publishedYear, publicationDate);

        const existingBook = await req.dbAdapter.findOneInCollection('books', { isbn });

        const baseLocation = location || 'main-library';
        const allowedCopyStatuses = new Set(['available', 'borrowed', 'lost', 'damaged', 'maintenance']);

        const buildCopies = () => {
            const rawCopies = Array.isArray(incomingCopies) && incomingCopies.length > 0
                ? incomingCopies
                : Array.from({ length: Math.max(parseInt(numberOfCopies, 10) || 1, 1) }).map(() => ({}));

            const seenCopyIds = new Set();
            const preparedCopies = [];

            for (const raw of rawCopies) {
                const copyId = (raw.copyId || generateCopyId(isbn)).toUpperCase();
                if (seenCopyIds.has(copyId)) {
                    throw new Error(`Duplicate copy ID ${copyId} in request payload`);
                }
                seenCopyIds.add(copyId);

                const statusValue = String(raw.status || 'available').toLowerCase();
                const normalizedStatus = allowedCopyStatuses.has(statusValue) ? statusValue : 'available';

                preparedCopies.push({
                    copyId,
                    status: normalizedStatus,
                    condition: raw.condition || 'good',
                    location: raw.location || baseLocation,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: req.user.id
                });
            }

            return preparedCopies;
        };

        let copiesToAdd;
        try {
            copiesToAdd = buildCopies();
        } catch (error) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: `Create book failed: ${error.message}`,
                details: {
                    error: error.message
                }
            });
            return res.status(400).json({ message: error.message });
        }

        if (!copiesToAdd || copiesToAdd.length === 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Create book failed: at least one copy required'
            });
            return res.status(400).json({ message: 'At least one book copy is required' });
        }

        const availableCopiesCount = (copies) => copies.filter(c => c.status === 'available').length;

        if (existingBook) {
            const existingCopyIds = new Set((existingBook.copies || []).map(copy => copy.copyId));
            for (const copy of copiesToAdd) {
                if (existingCopyIds.has(copy.copyId)) {
                    setAuditContext(req, {
                        success: false,
                        status: 'Conflict',
                        description: `Create book failed: duplicate copy ID ${copy.copyId}`,
                        metadata: {
                            copyId: copy.copyId
                        }
                    });
                    return res.status(400).json({ message: `Copy ID ${copy.copyId} already exists for this book` });
                }
                existingCopyIds.add(copy.copyId);
            }

            const updatedCopies = [...(existingBook.copies || []), ...copiesToAdd];
            const updatePayload = {
                copies: updatedCopies,
                totalCopies: updatedCopies.length,
                availableCopies: availableCopiesCount(updatedCopies),
                updatedAt: new Date(),
                updatedBy: req.user.id
            };

            const updatableFields = {
                title,
                author,
                publisher,
                category,
                description,
                coverImage,
                status,
                language,
                deweyDecimal,
                publicationDate
            };

            if (sanitizedPages !== null) {
                updatableFields.pages = sanitizedPages;
            }

            if (publishedYearMeta.shouldUpdate) {
                updatePayload.publishedYear = publishedYearMeta.value;
            }

            Object.entries(updatableFields).forEach(([key, value]) => {
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                    updatePayload[key] = value;
                }
            });

            await req.dbAdapter.updateInCollection('books', { id: existingBook.id }, updatePayload);

            setAuditContext(req, {
                entityId: existingBook.id,
                description: `Updated existing book ${existingBook.title || existingBook.id}`,
                details: {
                    addedCopies: copiesToAdd.length,
                    isbn: existingBook.isbn,
                },
                metadata: {
                    actorId: req.user.id,
                    addedCopyIds: copiesToAdd.map(copy => copy.copyId)
                },
                success: true,
                status: 'Updated'
            });

            return res.status(200).json({
                message: `Existing book updated with ${copiesToAdd.length} new ${copiesToAdd.length === 1 ? 'copy' : 'copies'}`,
                bookId: existingBook.id,
                addedCopyIds: copiesToAdd.map(copy => copy.copyId),
                duplicate: true
            });
        }

        if (!title || !author) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Create book failed: title and author are required',
            });
            return res.status(400).json({ message: 'Title and author are required for new books' });
        }

        const bookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newBook = {
            id: bookId,
            title,
            author,
            isbn,
            publisher: publisher || '',
            publishedYear: publishedYearMeta.shouldUpdate ? publishedYearMeta.value : null,
            category: category || 'General',
            description: description || '',
            coverImage: coverImage || '',
            status: status || 'active',
            language: language || 'English',
            pages: sanitizedPages,
            deweyDecimal: deweyDecimal || '',
            publicationDate: publicationDate || null,
            totalCopies: copiesToAdd.length,
            availableCopies: availableCopiesCount(copiesToAdd),
            copies: copiesToAdd,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: req.user.id
        };

        await req.dbAdapter.insertIntoCollection('books', newBook);

        setAuditContext(req, {
            entityId: bookId,
            resourceId: bookId,
            description: `Created book ${title}`,
            details: {
                isbn,
                author,
                totalCopies: newBook.totalCopies,
            },
            metadata: {
                actorId: req.user.id,
                location,
                copyIds: copiesToAdd.map(copy => copy.copyId)
            },
            success: true,
            status: 'Created'
        });

        res.status(201).json({
            message: 'Book created successfully',
            bookId,
            copyIds: copiesToAdd.map(copy => copy.copyId),
            duplicate: false
        });
    } catch (error) {
        console.error('Create book error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: 'Failed to create book',
            details: { error: error.message },
        });
        res.status(500).json({ message: 'Failed to create book' });
    }
});

router.put('/:id', verifyToken, requireStaff, logAction('UPDATE', 'book'), async(req, res) => {
    try {
        const { title, author, publisher, publishedYear, category, description, coverImage, status } = req.body;
        setAuditContext(req, {
            entityId: req.params.id,
            metadata: {
                updateRequest: {
                    bookId: req.params.id,
                    fields: Object.keys(req.body || {})
                }
            }
        });
        const book = await req.dbAdapter.findOneInCollection('books', { id: req.params.id });
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'BookNotFound',
                description: `Add copies failed: book ${req.params.id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }
        const updateData = { updatedAt: new Date(), updatedBy: req.user.id };
        if (title) updateData.title = title;
        if (author) updateData.author = author;
        if (publisher) updateData.publisher = publisher;
        if (publishedYear) updateData.publishedYear = publishedYear;
        if (category) updateData.category = category;
        if (description) updateData.description = description;
        if (coverImage) updateData.coverImage = coverImage;
        if (status) updateData.status = status;
        await req.dbAdapter.updateInCollection('books', { id: req.params.id }, updateData);

        setAuditContext(req, {
            entityId: req.params.id,
            description: `Updated book ${book.title || req.params.id}`,
            details: {
                updatedFields: Object.keys(updateData).filter((key) => key !== 'updatedAt' && key !== 'updatedBy'),
            },
            metadata: {
                actorId: req.user.id
            },
            success: true,
            status: 'Updated'
        });

        res.json({ message: 'Book updated successfully' });
    } catch (error) {
        console.error('Update book error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: 'Failed to update book',
            details: { error: error.message },
        });
        res.status(500).json({ message: 'Failed to update book' });
    }
});

router.delete('/:id', verifyToken, requireLibrarian, logAction('DELETE', 'book'), async(req, res) => {
    try {
        setAuditContext(req, {
            entityId: req.params.id
        });
        const book = await req.dbAdapter.findOneInCollection('books', { id: req.params.id });
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'BookNotFound',
                description: `Delete book failed: book ${req.params.id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }
        const borrowedCopies = book.copies ?.filter(c => c.status === 'borrowed') || [];
        if (borrowedCopies.length > 0) {
            setAuditContext(req, {
                success: false,
                status: 'Conflict',
                description: `Delete book failed: ${borrowedCopies.length} copies currently borrowed`,
                details: {
                    borrowedCount: borrowedCopies.length,
                },
            });
            return res.status(400).json({ message: 'Cannot delete book with borrowed copies' });
        }
        await req.dbAdapter.deleteFromCollection('books', { id: req.params.id });

        setAuditContext(req, {
            entityId: req.params.id,
            description: `Deleted book ${book.title || req.params.id}`,
            details: {
                isbn: book.isbn,
                totalCopies: book.copies ?.length || 0,
            },
            metadata: {
                actorId: req.user.id
            },
            success: true,
            status: 'Deleted'
        });

        res.json({ message: 'Book and all copies deleted successfully' });
    } catch (error) {
        console.error('Delete book error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: 'Failed to delete book',
            details: { error: error.message },
        });
        res.status(500).json({ message: 'Failed to delete book' });
    }
});


router.post('/:id/copies', verifyToken, requireStaff, logAction('ADD_COPIES', 'book'), async(req, res) => {
    try {
        const { numberOfCopies = 1, location = 'main-library' } = req.body;
        setAuditContext(req, {
            entityId: req.params.id,
            metadata: {
                addCopiesRequest: {
                    numberOfCopies,
                    location
                }
            }
        });
        const book = await req.dbAdapter.findOneInCollection('books', { id: req.params.id });
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'BookNotFound',
                description: `Add copies failed: book ${req.params.id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }
        const newCopies = [];
        const copyIds = [];
        for (let i = 0; i < numberOfCopies; i++) {
            const copyId = generateCopyId(book.isbn);
            newCopies.push({ copyId, status: 'available', condition: 'good', location, createdAt: new Date(), updatedAt: new Date(), createdBy: req.user.id });
            copyIds.push(copyId);
        }
        const updatedCopies = [...(book.copies || []), ...newCopies];
        await req.dbAdapter.updateInCollection('books', { id: req.params.id }, { copies: updatedCopies, totalCopies: updatedCopies.length, availableCopies: updatedCopies.filter(c => c.status === 'available').length, updatedAt: new Date() });

        setAuditContext(req, {
            entityId: req.params.id,
            description: `Added ${numberOfCopies} copies to ${book.title || req.params.id}`,
            details: {
                copyIds,
                location,
            },
            metadata: {
                actorId: req.user.id
            },
            success: true,
            status: 'Updated'
        });

        res.status(201).json({ message: 'Book copies added successfully', copyIds });
    } catch (error) {
        console.error('Add copies error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: 'Failed to add book copies',
            details: { error: error.message },
        });
        res.status(500).json({ message: 'Failed to add book copies' });
    }
});

router.get('/:id/copies', verifyToken, async(req, res) => {
    try {
        const book = await req.dbAdapter.findOneInCollection('books', { id: req.params.id });
        if (!book) return res.status(404).json({ message: 'Book not found' });
        res.json(book.copies || []);
    } catch (error) {
        console.error('Get copies error:', error);
        res.status(500).json({ message: 'Failed to fetch book copies' });
    }
});

router.get('/:id/history', verifyToken, async(req, res) => {
    try {
        const book = await req.dbAdapter.findOneInCollection('books', { id: req.params.id });
        if (!book) {
            return res.status(404).json({ message: 'Book not found' });
        }

        const allTransactions = await req.dbAdapter.findInCollection('transactions', {});
        const allUsers = await req.dbAdapter.findInCollection('users', {});

        const userLookup = buildLookupMap(allUsers, user => [user.id, user._id, user.uid, user.userId, user.libraryCardNumber]);
        const copyIds = new Set((book.copies || []).map(copy => String(copy.copyId).toLowerCase()).filter(Boolean));
        const bookIdentifiers = new Set([
            book.id,
            book._id,
            book.bookId,
            book.isbn
        ].filter(Boolean).map(value => String(value).toLowerCase()));

        const history = [];

        allTransactions.forEach(transaction => {
            const borrower = userLookup.get(String(transaction.userId || transaction.borrowerId || '').toLowerCase()) || null;
            const borrowerName = getBorrowerName(borrower);
            const baseBorrowDate = transaction.borrowDate || transaction.createdAt || null;
            const baseDueDate = transaction.dueDate || null;
            const baseReturnDate = transaction.returnDate || null;
            const baseStatus = normalizeStatus(transaction.status);

            const items = Array.isArray(transaction.items) && transaction.items.length > 0
                ? transaction.items
                : [{
                    copyId: transaction.copyId || '',
                    bookId: transaction.bookId || transaction.isbn || '',
                    borrowDate: baseBorrowDate,
                    dueDate: baseDueDate,
                    returnedAt: baseReturnDate,
                    status: transaction.status
                }];

            items.forEach((item, index) => {
                const itemCopyId = item.copyId ? String(item.copyId).toLowerCase() : null;
                const itemBookIds = [item.bookId, item.isbn, item.book?.id, item.book?.isbn]
                    .filter(Boolean)
                    .map(value => String(value).toLowerCase());

                const matchesCopy = itemCopyId ? copyIds.has(itemCopyId) : false;
                const matchesBook = itemBookIds.some(identifier => bookIdentifiers.has(identifier));

                if (!matchesCopy && !matchesBook) {
                    return;
                }

                const borrowDate = item.borrowDate || baseBorrowDate;
                const dueDate = item.dueDate || baseDueDate;
                const returnDate = item.returnedAt || baseReturnDate;
                const status = normalizeStatus(item.status) || baseStatus;

                history.push({
                    _id: `${transaction.id || transaction._id || 'transaction'}_${item.copyId || index}`,
                    transactionId: transaction.id || transaction._id || null,
                    copyId: item.copyId || 'N/A',
                    borrowerId: transaction.userId || transaction.borrowerId || null,
                    borrowerName,
                    borrowDate,
                    dueDate,
                    returnDate,
                    status,
                    fineAmount: transaction.fineAmount || transaction.fine || 0
                });
            });
        });

        history.sort((a, b) => new Date(b.borrowDate || b.createdAt || 0) - new Date(a.borrowDate || a.createdAt || 0));

        res.json(history);
    } catch (error) {
        console.error('Get book history error:', error);
        res.status(500).json({ message: 'Failed to fetch borrowing history' });
    }
});

router.patch('/copies/:copyId', verifyToken, requireStaff, logAction('UPDATE_COPY', 'book'), async(req, res) => {
    try {
        const { status, condition, location } = req.body;
        setAuditContext(req, {
            metadata: {
                updateCopyRequest: {
                    copyId: req.params.copyId,
                    status: status || null,
                    condition: condition || null,
                    location: location || null
                }
            }
        });
        const allBooks = await req.dbAdapter.findInCollection('books', {});
        let targetBook = null;
        let targetCopyIndex = -1;
        for (const book of allBooks) {
            const copyIndex = book.copies ?.findIndex(c => c.copyId === req.params.copyId);
            if (copyIndex !== undefined && copyIndex >= 0) {
                targetBook = book;
                targetCopyIndex = copyIndex;
                break;
            }
        }
        if (!targetBook || targetCopyIndex === -1) {
            setAuditContext(req, {
                success: false,
                status: 'CopyNotFound',
                description: `Update copy failed: copy ${req.params.copyId} not found`,
            });
            return res.status(404).json({ message: 'Book copy not found' });
        }
        const updatedCopies = [...targetBook.copies];
        if (status) updatedCopies[targetCopyIndex].status = status;
        if (condition) updatedCopies[targetCopyIndex].condition = condition;
        if (location) updatedCopies[targetCopyIndex].location = location;
        updatedCopies[targetCopyIndex].updatedAt = new Date();
        updatedCopies[targetCopyIndex].updatedBy = req.user.id;
        const availableCopies = updatedCopies.filter(c => c.status === 'available').length;
        await req.dbAdapter.updateInCollection('books', { id: targetBook.id }, { copies: updatedCopies, availableCopies, updatedAt: new Date() });
        setAuditContext(req, {
            entityId: targetBook.id,
            description: `Updated copy ${req.params.copyId} for ${targetBook.title || targetBook.id}`,
            details: {
                status: status || updatedCopies[targetCopyIndex].status,
                condition: condition || updatedCopies[targetCopyIndex].condition,
                location: location || updatedCopies[targetCopyIndex].location,
            },
            metadata: {
                actorId: req.user.id
            },
            success: true,
            status: 'Updated'
        });
        res.json({ message: 'Book copy updated successfully' });
    } catch (error) {
        console.error('Update copy error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: 'Failed to update book copy',
            details: { error: error.message },
        });
        res.status(500).json({ message: 'Failed to update book copy' });
    }
});

router.get('/search/advanced', verifyToken, async(req, res) => {
    try {
        const { q, type = 'all' } = req.query;
        if (!q) return res.status(400).json({ message: 'Search query required' });
        const searchLower = q.toLowerCase();
        const allBooks = await req.dbAdapter.findInCollection('books', {});
        const results = [];
        for (const book of allBooks) {
            let matches = false;
            switch (type) {
                case 'title':
                    matches = book.title ?.toLowerCase().includes(searchLower);
                    break;
                case 'author':
                    matches = book.author ?.toLowerCase().includes(searchLower);
                    break;
                case 'isbn':
                    matches = book.isbn ?.toLowerCase().includes(searchLower);
                    break;
                case 'all':
                default:
                    matches = book.title ?.toLowerCase().includes(searchLower) || book.author ?.toLowerCase().includes(searchLower) || book.isbn ?.toLowerCase().includes(searchLower) || book.publisher ?.toLowerCase().includes(searchLower) || book.category ?.toLowerCase().includes(searchLower);
                    break;
            }
            if (matches) results.push(book);
        }
        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Search failed' });
    }
});

router.get('/meta/categories', verifyToken, async(req, res) => {
    try {
        const allBooks = await req.dbAdapter.findInCollection('books', {});
        const categories = new Set();
        allBooks.forEach(book => { if (book.category) categories.add(book.category); });
        res.json(Array.from(categories).sort());
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ message: 'Failed to fetch categories' });
    }
});

module.exports = router;
