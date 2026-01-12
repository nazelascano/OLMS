const express = require('express');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const { ObjectId } = require('mongodb');
const { verifyToken, requireStaff, requireLibrarian, logAction, setAuditContext } = require('../middleware/customAuth');
const { maybeNotifyLowInventory } = require('../utils/inventoryNotifications');
const router = express.Router();

const allowedCopyStatuses = new Set(['available', 'borrowed', 'lost', 'damaged', 'maintenance']);

const toFiniteNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== '') {
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return null;
};

const notifyInventoryState = async (req, bookSnapshot, source) => {
    if (!req || !bookSnapshot) {
        return;
    }
    try {
        await maybeNotifyLowInventory(req.dbAdapter, bookSnapshot, { source });
    } catch (error) {
        console.error('Inventory notification error:', error.message || error);
    }
};

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
    return String(value).toLowerCase().trim();
};

const availableCopiesCount = (copies = []) =>
    copies.filter((copy) => normalizeString(copy.status) === 'available').length;

const getAvailableQuantity = (book = {}) => {
    if (!book || typeof book !== 'object') {
        return 0;
    }
    const directValue = toFiniteNumber(
        book.availableCopiesCount !== undefined ? book.availableCopiesCount : book.availableCopies
    );
    if (directValue !== null && directValue >= 0) {
        return directValue;
    }
    if (Array.isArray(book.copies)) {
        return availableCopiesCount(book.copies);
    }
    return 0;
};

const sanitizeAuthorName = (value) => {
    if (value === undefined || value === null) {
        return null;
    }
    const normalized = String(value).replace(/\s+/g, ' ').trim();
    return normalized || null;
};

const splitDelimitedAuthors = (value) => {
    if (typeof value !== 'string') {
        return [];
    }
    if (/[;,|]/.test(value)) {
        return value.split(/[,;|]/).map(sanitizeAuthorName).filter(Boolean);
    }
    const normalized = sanitizeAuthorName(value);
    return normalized ? [normalized] : [];
};

const mergeAuthorSources = (...sources) => {
    const seen = new Set();
    const authors = [];
    sources.forEach((source) => {
        if (source === undefined || source === null) {
            return;
        }
        if (Array.isArray(source)) {
            source.forEach((entry) => {
                const normalized = sanitizeAuthorName(entry);
                if (normalized && !seen.has(normalized.toLowerCase())) {
                    seen.add(normalized.toLowerCase());
                    authors.push(normalized);
                }
            });
            return;
        }
        if (typeof source === 'string') {
            splitDelimitedAuthors(source).forEach((entry) => {
                if (entry && !seen.has(entry.toLowerCase())) {
                    seen.add(entry.toLowerCase());
                    authors.push(entry);
                }
            });
        }
    });
    return authors;
};

const deriveAuthorsFromPayload = (payload = {}) => {
    const authors = mergeAuthorSources(payload.authors, payload.author);
    return {
        authors,
        authorDisplay: authors.length > 0 ? authors.join(', ') : '',
        hasAuthors: authors.length > 0
    };
};

const ensureAuthorMetadata = (record) => {
    if (!record || typeof record !== 'object') {
        return record;
    }
    const merged = mergeAuthorSources(record.authors, record.author);
    record.authors = merged;
    if (merged.length > 0) {
        record.author = merged.join(', ');
    } else if (typeof record.author !== 'string') {
        record.author = '';
    }
    return record;
};

const matchesBookSearch = (book, term) => {
    if (!term) return true;
    if (typeof term === 'string' && term.trim() === '') return true;
    const searchTerm = normalizeString(term);
    if (!searchTerm) return true;
    const fields = [
        book.title,
        book.author,
        book.isbn,
        book.publisher,
        book.category,
        book.description,
        book.id,
        book._id
    ];

    if (fields.some((field) => normalizeString(field).includes(searchTerm))) {
        return true;
    }

    if (Array.isArray(book.authors) && book.authors.some((author) => normalizeString(author).includes(searchTerm))) {
        return true;
    }

    if (Array.isArray(book.copies)) {
        for (const copy of book.copies) {
            const copyFields = [
                copy.copyId,
                copy.location,
                copy.status,
                copy.condition,
                copy.barcode
            ];
            if (copyFields.some((value) => normalizeString(value).includes(searchTerm))) {
                return true;
            }
        }
    }

    return false;
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
        authors: Array.isArray(book.authors) ? book.authors : [],
        isbn: book.isbn || '',
        category: book.category || '',
        publisher: book.publisher || '',
        publishedYear: book.publishedYear || book.publicationYear || null,
        availableCopies: availableCopies.length,
        totalCopies: copies.length,
        copies,
    };
};

const sanitizeFileName = (value, fallback = 'labels') => {
    if (!value || typeof value !== 'string') {
        return fallback;
    }
    return value
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_\-]/g, '')
        .slice(0, 80) || fallback;
};

const normalizeIdentifierValue = (value) => {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim();
};

const getAdapterType = (req) => {
    if (!req?.dbAdapter || typeof req.dbAdapter.getType !== 'function') {
        return null;
    }
    try {
        return req.dbAdapter.getType();
    } catch (error) {
        return null;
    }
};

const buildBookLookupFilters = (identifier, adapterType) => {
    const normalized = normalizeIdentifierValue(identifier);
    if (!normalized) {
        return [];
    }

    const filters = [];
    const seen = new Set();
    const addFilter = (filter) => {
        if (!filter) return;
        const signature = JSON.stringify(filter);
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        filters.push(filter);
    };

    if (adapterType === 'mongo' && ObjectId.isValid(normalized)) {
        addFilter({ _id: new ObjectId(normalized) });
    }

    ['id', '_id', 'bookId', 'documentId'].forEach((key) => addFilter({ [key]: normalized }));

    return filters;
};

const findBookByIdentifier = async (req, identifier) => {
    const adapterType = getAdapterType(req);
    const filters = buildBookLookupFilters(identifier, adapterType);
    if (filters.length === 0) {
        return null;
    }

    // Sequential lookup keeps compatibility with offline adapter that lacks $or support.
    for (const filter of filters) {
        try {
            const book = await req.dbAdapter.findOneInCollection('books', filter);
            if (book) {
                return ensureAuthorMetadata(book);
            }
        } catch (error) {
            console.warn(`Book lookup failed for filter ${JSON.stringify(filter)}`, error.message);
        }
    }

    return null;
};

const resolveBookPersistenceFilter = (req, book) => {
    if (!book) {
        return null;
    }

    const adapterType = getAdapterType(req);
    if (book.id) {
        return { id: book.id };
    }
    if (book._id) {
        if (adapterType === 'mongo' && ObjectId.isValid(book._id)) {
            return { _id: new ObjectId(book._id) };
        }
        return { _id: book._id };
    }
    if (book.bookId) {
        return { bookId: book.bookId };
    }
    return null;
};

const wrapTextLines = (text, maxCharsPerLine, maxLines) => {
    if (!text) {
        return [];
    }

    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = '';

    words.forEach((word) => {
        if (!currentLine) {
            currentLine = word;
            return;
        }

        const next = `${currentLine} ${word}`;
        if (next.length <= maxCharsPerLine) {
            currentLine = next;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.slice(0, maxLines);
};

const buildBarcodePdf = async({
    book,
    copies,
    requestedCopyIds,
    generatedBy,
}) => {
    const pdfDoc = await PDFDocument.create();
    const pageWidth = 612; // 8.5in * 72
    const pageHeight = 792; // 11in * 72
    const marginX = 36;
    const marginY = 36;
    const columns = 3;
    const rows = 4;
    const cardWidth = (pageWidth - marginX * 2) / columns;
    const cardHeight = (pageHeight - marginY * 2) / rows;
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let columnIndex = 0;
    let rowIndex = 0;

    const drawLabel = async(copy) => {
        const qrDataUrl = await QRCode.toDataURL(copy.copyId, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 256,
        });

        const pngBase64 = qrDataUrl.split(',')[1];
        const qrImage = await pdfDoc.embedPng(Buffer.from(pngBase64, 'base64'));

        if (columnIndex >= columns) {
            columnIndex = 0;
            rowIndex += 1;
        }

        if (rowIndex >= rows) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            rowIndex = 0;
            columnIndex = 0;
        }

        const originX = marginX + columnIndex * cardWidth;
        const originY = pageHeight - marginY - (rowIndex + 1) * cardHeight;

        page.drawRectangle({
            x: originX,
            y: originY,
            width: cardWidth,
            height: cardHeight,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5,
        });

        const copyIdLines = wrapTextLines(copy.copyId || 'N/A', 28, 2);
        const copyLineHeight = 11;
        const bottomPadding = 10;
        const locationBlockHeight = 12;
        const generatedByHeight = generatedBy ? 10 : 0;
        const bottomAreaHeight = bottomPadding + generatedByHeight + locationBlockHeight + copyIdLines.length * copyLineHeight;

    // Layout tuning arrays let us balance title height, QR size, and bottom metadata per label.
    const bottomGaps = [8, 6, 4];
        const topMargins = [18, 16, 14, 12];
        const titleOptions = [
            { size: 12, maxChars: 26, lineHeight: 17 },
            { size: 11, maxChars: 28, lineHeight: 16 },
            { size: 10, maxChars: 32, lineHeight: 15 },
        ];
        const isbnGap = 6;
        const isbnToQrGap = 12;
        const desiredQrSize = Math.min(cardWidth - 48, 88);
        const minPreferredQr = 48;
        const minQrSize = 34;

        let layout = null;
        let lastLayout = null;
        let layoutFound = false;

        for (const gap of bottomGaps) {
            const qrAreaBottom = originY + bottomAreaHeight + gap;
            for (const margin of topMargins) {
                const titleStartY = originY + cardHeight - margin;
                for (const option of titleOptions) {
                    const lines = wrapTextLines(book.title || 'Untitled', option.maxChars, 3);
                    const titleHeight = lines.length * option.lineHeight;
                    const isbnY = titleStartY - titleHeight - isbnGap;
                    const qrTop = isbnY - isbnToQrGap;
                    const availableHeight = qrTop - qrAreaBottom;

                    lastLayout = {
                        lines,
                        fontSize: option.size,
                        lineHeight: option.lineHeight,
                        titleStartY,
                        isbnY,
                        qrTop,
                        availableHeight,
                        qrAreaBottom,
                    };

                    if (availableHeight >= minPreferredQr) {
                        layout = lastLayout;
                        layoutFound = true;
                        break;
                    }
                }
                if (layoutFound) break;
            }
            if (layoutFound) break;
        }

        if (!layout) {
            layout = lastLayout;
        }

        const qrAvailableHeight = Math.max(layout?.availableHeight || minPreferredQr, minQrSize);
        let qrSize = Math.min(desiredQrSize, qrAvailableHeight);
        if (layout && layout.availableHeight < minPreferredQr) {
            qrSize = Math.min(desiredQrSize, Math.max(layout.availableHeight, minQrSize));
        }
        if (layout && layout.availableHeight > 0) {
            qrSize = Math.min(qrSize, layout.availableHeight);
        }
        const qrAreaBottom = layout ? layout.qrAreaBottom : originY + bottomAreaHeight + bottomGaps[0];
        const qrY = qrAreaBottom + Math.max(((layout?.availableHeight || qrSize) - qrSize) / 2, 0);
        const qrX = originX + (cardWidth - qrSize) / 2;

        const titleLines = layout ? layout.lines : wrapTextLines(book.title || 'Untitled', 26, 3);
        const titleFontSize = layout ? layout.fontSize : 12;
        const titleLineHeight = layout ? layout.lineHeight : 17;
        let titleCursorY = layout ? layout.titleStartY : originY + cardHeight - 18;

        titleLines.forEach((line) => {
            page.drawText(line, {
                x: originX + 12,
                y: titleCursorY,
                size: titleFontSize,
                font: fontBold,
                color: rgb(0, 0, 0),
                maxWidth: cardWidth - 24,
            });
            titleCursorY -= titleLineHeight;
        });

        const isbnY = layout ? layout.isbnY : titleCursorY - 10;
        page.drawText(`ISBN: ${book.isbn || 'N/A'}`, {
            x: originX + 12,
            y: isbnY,
            size: 9,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.2),
            maxWidth: cardWidth - 24,
        });

        page.drawImage(qrImage, {
            x: qrX,
            y: qrY,
            width: qrSize,
            height: qrSize,
        });

        let bottomCursor = originY + bottomPadding;

        if (generatedBy) {
            page.drawText(`Printed by: ${generatedBy}`, {
                x: originX + 12,
                y: bottomCursor,
                size: 7,
                font: fontRegular,
                color: rgb(0.45, 0.45, 0.45),
                maxWidth: cardWidth - 24,
            });
            bottomCursor += generatedByHeight;
        }

        const locationText = `Location: ${copy.location || 'Main Library'}`;
        page.drawText(locationText, {
            x: originX + 12,
            y: bottomCursor,
            size: 9,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.2),
            maxWidth: cardWidth - 24,
        });
        bottomCursor += locationBlockHeight;

        copyIdLines.slice().reverse().forEach((line) => {
            page.drawText(line, {
                x: originX + 12,
                y: bottomCursor,
                size: 10,
                font: fontRegular,
                color: rgb(0, 0, 0),
                maxWidth: cardWidth - 24,
            });
            bottomCursor += copyLineHeight;
        });

        columnIndex += 1;
    };

    // eslint-disable-next-line no-restricted-syntax
    for (const copy of copies) {
        // eslint-disable-next-line no-await-in-loop
        await drawLabel(copy);
    }

    const pdfBytes = await pdfDoc.save();
    const safeName = sanitizeFileName(`${book.title || 'book'}_${requestedCopyIds.length}_barcodes`);

    return {
        filename: `${safeName}.pdf`,
        buffer: Buffer.from(pdfBytes),
    };
};

router.get('/', verifyToken, async(req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            category,
            status,
            sortBy = 'title',
            sortOrder = 'asc'
        } = req.query;
        let filters = {};
        if (category) filters.category = category;
        if (status) filters.status = status;
        let books = await req.dbAdapter.findInCollection('books', filters);
        books = books.map((book) => {
            const normalized = ensureAuthorMetadata(book);
            const copiesArray = Array.isArray(normalized.copies) ? normalized.copies : [];
            const availableCount = getAvailableQuantity(normalized);
            return {
                ...normalized,
                copiesCount: copiesArray.length,
                availableCopiesCount: availableCount
            };
        });
        if (search) {
            books = books.filter(book => matchesBookSearch(book, search));
        }
        const resolvedSortBy = sortBy || 'title';
        const resolvedSortOrder = sortOrder === 'desc' ? 'desc' : 'asc';
        const isNumeric = (value) => typeof value === 'number' && Number.isFinite(value);
        books.sort((a, b) => {
            const aVal = a[resolvedSortBy];
            const bVal = b[resolvedSortBy];
            let comparison = 0;
            if (isNumeric(aVal) && isNumeric(bVal)) {
                comparison = aVal - bVal;
            } else {
                const aStr = aVal === undefined || aVal === null ? '' : String(aVal);
                const bStr = bVal === undefined || bVal === null ? '' : String(bVal);
                comparison = aStr.localeCompare(bStr, undefined, { sensitivity: 'base' });
            }
            return resolvedSortOrder === 'desc' ? -comparison : comparison;
        });
        const totalBooks = books.length;
        const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
        const limitString = typeof limit === 'string' ? limit.toLowerCase() : limit;
        const wantsAll = limitString === 'all' || parseInt(limit, 10) === -1;
        const resolvedLimit = wantsAll ? totalBooks : Math.max(parseInt(limit, 10) || 20, 1);
        const startIndex = wantsAll ? 0 : (normalizedPage - 1) * resolvedLimit;
        const endIndex = wantsAll ? totalBooks : startIndex + resolvedLimit;
        const paginatedBooks = wantsAll ? books : books.slice(startIndex, endIndex);
        const booksWithCopies = paginatedBooks.map((book) => {
            const copiesArray = Array.isArray(book.copies) ? book.copies : [];
            return {
                ...book,
                copiesCount: copiesArray.length,
                availableCopiesCount: getAvailableQuantity(book)
            };
        });
        const totalPages = wantsAll ? (totalBooks > 0 ? 1 : 0) : Math.ceil(totalBooks / resolvedLimit);
        res.json({
            books: booksWithCopies,
            total: totalBooks,
            pagination: {
                currentPage: normalizedPage,
                totalPages,
                totalBooks,
                hasMore: !wantsAll && endIndex < totalBooks,
                limit: resolvedLimit,
                mode: wantsAll ? 'all' : 'paged'
            }
        });
    } catch (error) {
        console.error('Get books error:', error);
        res.status(500).json({ message: 'Failed to fetch books' });
    }
});

// Allow authenticated users (including students) to search books. Staff-only actions
// remain protected elsewhere.
router.get('/search', verifyToken, async(req, res) => {
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
        books.forEach(ensureAuthorMetadata);
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
        allExistingBooks.forEach(ensureAuthorMetadata);
        const existingBooksByIsbn = new Map(
            allExistingBooks.map(book => [(book.isbn || '').toLowerCase(), book])
        );

        const normalizeRowIndex = (value, fallback = null) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            if (typeof value === 'string' && value.trim() !== '') {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
            return fallback;
        };

        const results = { successful: [], failed: [] };

        for (const [index, bookData] of books.entries()) {
            const rowIndex = normalizeRowIndex(bookData?.rowIndex, index + 1);
            const rawIsbn = typeof bookData?.isbn === 'string' ? bookData.isbn.trim() : bookData?.isbn;
            const baseRecord = {
                isbn: rawIsbn || null,
                title: typeof bookData?.title === 'string' ? bookData.title.trim() : bookData?.title || '',
                rowIndex
            };
            const validationIssues = [];

            if (!rawIsbn) {
                validationIssues.push('ISBN is required');
            }

            const normalizedIsbn = rawIsbn ? rawIsbn.toLowerCase() : '';
            const existingBook = normalizedIsbn ? existingBooksByIsbn.get(normalizedIsbn) : null;

            const rawTitle = typeof bookData?.title === 'string' ? bookData.title.trim() : bookData?.title;
            const rawAuthor = typeof bookData?.author === 'string' ? bookData.author.trim() : bookData?.author;
            const authorMeta = deriveAuthorsFromPayload({
                author: rawAuthor,
                authors: bookData?.authors
            });

            if (!existingBook) {
                if (!rawTitle) {
                    validationIssues.push('Title is required for new books');
                }
                if (!authorMeta.hasAuthors) {
                    validationIssues.push('Author is required for new books');
                }
            }

            let numberOfCopies = 1;
            if (bookData?.numberOfCopies !== undefined && bookData.numberOfCopies !== null && String(bookData.numberOfCopies).trim() !== '') {
                const parsedCopies = parseInt(bookData.numberOfCopies, 10);
                if (Number.isNaN(parsedCopies) || parsedCopies < 1) {
                    validationIssues.push('Invalid number of copies');
                } else {
                    numberOfCopies = parsedCopies;
                }
            }

            let parsedPublishedYear = null;
            if (bookData?.publishedYear !== undefined && bookData.publishedYear !== null && String(bookData.publishedYear).trim() !== '') {
                const candidateYear = parseInt(bookData.publishedYear, 10);
                if (Number.isNaN(candidateYear) || `${candidateYear}`.length !== 4) {
                    validationIssues.push('Invalid published year');
                } else {
                    parsedPublishedYear = candidateYear;
                }
            }

            if (validationIssues.length > 0) {
                results.failed.push({
                    ...baseRecord,
                    status: 'error',
                    message: validationIssues.join('; '),
                    issues: validationIssues
                });
                continue;
            }

            const isbn = rawIsbn;
            const location = bookData?.location || existingBook?.location || 'main-library';

            try {
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

                    const newCopyIds = copies.map((copy) => copy.copyId);
                    const updatedCopies = [...(existingBook.copies || []), ...copies];
                    const availableCopies = updatedCopies.filter(c => c.status === 'available').length;
                    const updatePayload = {
                        copies: updatedCopies,
                        totalCopies: updatedCopies.length,
                        availableCopies,
                        updatedAt: new Date(),
                        updatedBy: req.user.id
                    };

                    if (authorMeta.hasAuthors) {
                        updatePayload.author = authorMeta.authorDisplay;
                        updatePayload.authors = authorMeta.authors;
                    }

                    await req.dbAdapter.updateInCollection('books', { id: existingBook.id }, updatePayload);
                    await notifyInventoryState(req, { ...existingBook, ...updatePayload }, 'book-bulk-import');

                    existingBooksByIsbn.set(normalizedIsbn, {
                        ...existingBook,
                        ...updatePayload
                    });

                    results.successful.push({
                        ...baseRecord,
                        title: rawTitle || existingBook.title || 'Untitled',
                        message: `Added ${numberOfCopies} copies to existing book`,
                        bookId: existingBook.id,
                        copyIds: newCopyIds,
                        duplicate: true
                    });
                    continue;
                }

                const title = rawTitle;
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

                const newBook = {
                    id: bookId,
                    title,
                    author: authorMeta.authorDisplay,
                    authors: authorMeta.authors,
                    isbn,
                    publisher: bookData?.publisher || '',
                    publishedYear: parsedPublishedYear,
                    category: bookData?.category || 'General',
                    description: bookData?.description || '',
                    coverImage: bookData?.coverImage || '',
                    status: 'active',
                    totalCopies: numberOfCopies,
                    availableCopies: numberOfCopies,
                    copies,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: req.user.id
                };

                await req.dbAdapter.insertIntoCollection('books', newBook);
                await notifyInventoryState(req, newBook, 'book-bulk-import');
                existingBooksByIsbn.set(normalizedIsbn, newBook);
                results.successful.push({
                    ...baseRecord,
                    title,
                    message: 'Imported successfully',
                    bookId,
                    copyIds: copies.map((copy) => copy.copyId),
                    duplicate: false
                });
            } catch (error) {
                const issues = error?.details?.issues;
                results.failed.push({
                    ...baseRecord,
                    status: 'error',
                    message: error.message || 'Failed to import book',
                    ...(Array.isArray(issues) && issues.length > 0 ? { issues } : { issues: error.message ? [error.message] : [] })
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
                        message: book.message || 'Imported successfully',
                        bookId: book.bookId,
                        copyIds: book.copyIds,
                        duplicate: book.duplicate || false,
                        rowIndex: book.rowIndex ?? null
                    })),
                    ...results.failed.map(book => ({
                        isbn: book.isbn,
                        title: book.title,
                        status: 'error',
                        message: book.message,
                        issues: Array.isArray(book.issues) && book.issues.length > 0 ? book.issues : undefined,
                        rowIndex: book.rowIndex ?? null
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
        const book = await findBookByIdentifier(req, req.params.id);
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'Failed',
                description: `Get book failed: book ${req.params.id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }
        book.copiesCount = book.copies?.length || 0;
        book.availableCopiesCount = book.copies?.filter(c => c.status === 'available').length || 0;
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
            author: authorValue,
            authors: authorsValue,
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

        const authorMeta = deriveAuthorsFromPayload({ author: authorValue, authors: authorsValue });

        setAuditContext(req, {
            metadata: {
                createRequest: {
                    isbn: isbn || null,
                    title: title || null,
                    author: authorMeta.authorDisplay || null,
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
        if (existingBook) {
            ensureAuthorMetadata(existingBook);
        }

        const baseLocation = location || 'main-library';

        const buildCopies = () => {
            const rawCopies = Array.isArray(incomingCopies) && incomingCopies.length > 0
                ? incomingCopies
                : Array.from({ length: Math.max(parseInt(numberOfCopies, 10) || 1, 1) }).map(() => ({}));

            const seenCopyIds = new Set();
            const preparedCopies = [];

            for (const raw of rawCopies) {
                const copyId = (raw.copyId || generateCopyId(isbn)).toUpperCase();
                if (seenCopyIds.has(copyId)) {
                    throw new Error(`Duplicate reference ID ${copyId} in request payload`);
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
        if (existingBook) {
            const existingCopyIds = new Set((existingBook.copies || []).map(copy => copy.copyId));
            for (const copy of copiesToAdd) {
                if (existingCopyIds.has(copy.copyId)) {
                    setAuditContext(req, {
                        success: false,
                        status: 'Conflict',
                        description: `Create book failed: duplicate reference ID ${copy.copyId}`,
                        metadata: {
                            copyId: copy.copyId
                        }
                    });
                    return res.status(400).json({ message: `Reference ID ${copy.copyId} already exists for this book` });
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

            if (authorMeta.hasAuthors) {
                updatePayload.author = authorMeta.authorDisplay;
                updatePayload.authors = authorMeta.authors;
            }

            await req.dbAdapter.updateInCollection('books', { id: existingBook.id }, updatePayload);
            await notifyInventoryState(req, { ...existingBook, ...updatePayload }, 'book-create-append');

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
                copyIds: copiesToAdd.map(copy => copy.copyId),
                duplicate: true
            });
        }

        if (!title || !authorMeta.hasAuthors) {
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
            author: authorMeta.authorDisplay,
            authors: authorMeta.authors,
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
        await notifyInventoryState(req, newBook, 'book-create');

        setAuditContext(req, {
            entityId: bookId,
            resourceId: bookId,
            description: `Created book ${title}`,
            details: {
                isbn,
                author: authorMeta.authorDisplay,
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
        const payload = req.body || {};
        setAuditContext(req, {
            entityId: req.params.id,
            metadata: {
                updateRequest: {
                    bookId: req.params.id,
                    fields: Object.keys(payload)
                }
            }
        });

        const book = await findBookByIdentifier(req, req.params.id);
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'BookNotFound',
                description: `Update book failed: book ${req.params.id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }

        const persistenceFilter = resolveBookPersistenceFilter(req, book);
        if (!persistenceFilter) {
            console.error('Unable to resolve persistence filter for book update', req.params.id);
            return res.status(500).json({ message: 'Failed to update book' });
        }

        if (Object.prototype.hasOwnProperty.call(payload, 'isbn') && payload.isbn !== book.isbn) {
            return res.status(400).json({ message: 'ISBN cannot be changed for existing books' });
        }

        const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);
        const updateData = { updatedAt: new Date(), updatedBy: req.user.id };
        const stringFields = ['title', 'publisher', 'category', 'description', 'coverImage', 'status', 'language', 'deweyDecimal'];
        stringFields.forEach((field) => {
            if (hasField(field)) {
                updateData[field] = payload[field];
            }
        });

        if (hasField('authors') || hasField('author')) {
            const authorMeta = deriveAuthorsFromPayload({
                authors: hasField('authors') ? payload.authors : book.authors,
                author: hasField('author') ? payload.author : book.author,
            });
            updateData.authors = authorMeta.authors;
            updateData.author = authorMeta.authorDisplay;
        }

        if (hasField('publicationDate')) {
            updateData.publicationDate = payload.publicationDate || null;
        }

        if (hasField('pages')) {
            const pagesValue = payload.pages;
            if (pagesValue === null || pagesValue === '' || typeof pagesValue === 'undefined') {
                updateData.pages = null;
            } else {
                const parsedPages = parseInt(pagesValue, 10);
                if (Number.isNaN(parsedPages) || parsedPages <= 0) {
                    return res.status(400).json({ message: 'Invalid number of pages' });
                }
                updateData.pages = parsedPages;
            }
        }

        if (hasField('publishedYear') || hasField('publicationDate')) {
            try {
                const publishedYearMeta = computePublishedYear(
                    payload.publishedYear,
                    hasField('publicationDate') ? payload.publicationDate : book.publicationDate
                );
                if (publishedYearMeta.shouldUpdate) {
                    updateData.publishedYear = publishedYearMeta.value;
                } else if (payload.publishedYear === '' || payload.publishedYear === null) {
                    updateData.publishedYear = null;
                }
            } catch (err) {
                return res.status(400).json({ message: err.message });
            }
        }

        let copySummary = null;
        if (hasField('copies')) {
            const sanitizeCopiesPayload = () => {
                if (!Array.isArray(payload.copies) || payload.copies.length === 0) {
                    throw new Error('At least one copy is required');
                }

                const seenIds = new Set();
                const normalizedCopies = [];
                const existingCopies = Array.isArray(book.copies) ? book.copies : [];
                const existingCopyMap = new Map(
                    existingCopies
                        .filter((copy) => copy.copyId)
                        .map((copy) => [String(copy.copyId).toUpperCase(), copy])
                );

                const addedCopyIds = [];
                const updatedCopyIds = [];

                payload.copies.forEach((raw) => {
                    const normalizedId = String(raw?.copyId || '').trim().toUpperCase();
                    if (!normalizedId) {
                        throw new Error('Reference ID is required for each copy');
                    }
                    if (seenIds.has(normalizedId)) {
                        throw new Error(`Duplicate reference ID ${normalizedId}`);
                    }
                    seenIds.add(normalizedId);

                    const existing = existingCopyMap.get(normalizedId);
                    const statusValue = normalizeString(raw.status) || 'available';
                    const normalizedStatus = allowedCopyStatuses.has(statusValue) ? statusValue : 'available';

                    const baseCopy = existing ? { ...existing } : {
                        copyId: normalizedId,
                        createdAt: new Date(),
                        createdBy: req.user.id,
                    };

                    baseCopy.status = normalizedStatus;
                    baseCopy.condition = raw.condition || existing?.condition || 'good';
                    baseCopy.location = raw.location || existing?.location || 'main-library';
                    baseCopy.updatedAt = new Date();
                    baseCopy.updatedBy = req.user.id;

                    normalizedCopies.push(baseCopy);
                    if (existing) {
                        updatedCopyIds.push(normalizedId);
                    } else {
                        addedCopyIds.push(normalizedId);
                    }
                });

                const incomingIdSet = new Set(seenIds);
                const removedCopyIds = [];
                const blockedRemovals = [];

                (book.copies || []).forEach((copy) => {
                    const normalizedExistingId = String(copy.copyId || '').toUpperCase();
                    if (!incomingIdSet.has(normalizedExistingId)) {
                        if (normalizeString(copy.status) === 'borrowed') {
                            blockedRemovals.push(copy.copyId);
                        } else {
                            removedCopyIds.push(copy.copyId);
                        }
                    }
                });

                if (blockedRemovals.length > 0) {
                    const error = new Error('Cannot remove copies that are currently borrowed');
                    error.details = { copyIds: blockedRemovals };
                    throw error;
                }

                return {
                    copies: normalizedCopies,
                    summary: {
                        added: addedCopyIds,
                        removed: removedCopyIds,
                        updated: updatedCopyIds,
                    }
                };
            };

            try {
                const { copies, summary } = sanitizeCopiesPayload();
                updateData.copies = copies;
                updateData.totalCopies = copies.length;
                updateData.availableCopies = availableCopiesCount(copies);
                copySummary = summary;
            } catch (error) {
                const response = { message: error.message };
                if (error.details) {
                    response.details = error.details;
                }
                return res.status(400).json(response);
            }
        }

        const updatedFields = Object.keys(updateData).filter((key) => key !== 'updatedAt' && key !== 'updatedBy');
        if (updatedFields.length === 0) {
            return res.status(400).json({ message: 'No valid fields provided for update' });
        }

        await req.dbAdapter.updateInCollection('books', persistenceFilter, updateData);

        const touchesInventory = Object.prototype.hasOwnProperty.call(updateData, 'copies') ||
            Object.prototype.hasOwnProperty.call(updateData, 'availableCopies');
        if (touchesInventory) {
            await notifyInventoryState(req, { ...book, ...updateData }, 'book-update');
        }

        const auditDetails = {
            updatedFields: updatedFields.filter((field) => field !== 'copies'),
        };
        if (copySummary) {
            auditDetails.copies = copySummary;
        }

        setAuditContext(req, {
            entityId: book.id || book._id || req.params.id,
            description: `Updated book ${book.title || req.params.id}`,
            details: auditDetails,
            metadata: {
                actorId: req.user.id
            },
            success: true,
            status: 'Updated'
        });

        res.json({ message: 'Book updated successfully', updatedFields });
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
        const book = await findBookByIdentifier(req, req.params.id);
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'BookNotFound',
                description: `Delete book failed: book ${req.params.id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }
    const borrowedCopies = book.copies?.filter(c => c.status === 'borrowed') || [];
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
        const persistenceFilter = resolveBookPersistenceFilter(req, book);
        if (!persistenceFilter) {
            console.error('Unable to resolve persistence filter for book delete', req.params.id);
            return res.status(500).json({ message: 'Failed to delete book' });
        }

        await req.dbAdapter.deleteFromCollection('books', persistenceFilter);

        setAuditContext(req, {
            entityId: book.id || book._id || req.params.id,
            description: `Deleted book ${book.title || req.params.id}`,
            details: {
                isbn: book.isbn,
                totalCopies: book.copies?.length || 0,
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
        const book = await findBookByIdentifier(req, req.params.id);
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
        const persistenceFilter = resolveBookPersistenceFilter(req, book);
        if (!persistenceFilter) {
            console.error('Unable to resolve persistence filter for add copies', req.params.id);
            return res.status(500).json({ message: 'Failed to add book copies' });
        }

        const availableCopies = updatedCopies.filter(c => c.status === 'available').length;
        await req.dbAdapter.updateInCollection('books', persistenceFilter, {
            copies: updatedCopies,
            totalCopies: updatedCopies.length,
            availableCopies,
            updatedAt: new Date()
        });
        await notifyInventoryState(req, { ...book, copies: updatedCopies, availableCopies }, 'book-add-copies');

        setAuditContext(req, {
            entityId: book.id || book._id || req.params.id,
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

router.delete('/:id/copies/:copyId', verifyToken, requireStaff, logAction('DELETE_COPY', 'book'), async(req, res) => {
    try {
        const { id, copyId } = req.params;

        setAuditContext(req, {
            entityId: id,
            metadata: {
                deleteCopyRequest: {
                    copyId,
                },
            },
        });

        const book = await findBookByIdentifier(req, id);
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'BookNotFound',
                description: `Delete copy failed: book ${id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }

        const copies = Array.isArray(book.copies) ? [...book.copies] : [];
        const targetIndex = copies.findIndex((copy) => String(copy.copyId).toLowerCase() === String(copyId).toLowerCase());

        if (targetIndex === -1) {
            setAuditContext(req, {
                success: false,
                status: 'CopyNotFound',
                description: `Delete copy failed: copy ${copyId} not found in book ${id}`,
            });
            return res.status(404).json({ message: 'Book copy not found' });
        }

        const targetCopy = copies[targetIndex];
        const copyStatus = normalizeString(targetCopy.status);
        if (copyStatus === 'borrowed' || copyStatus === 'pending') {
            setAuditContext(req, {
                success: false,
                status: 'CopyBorrowed',
                description: `Delete copy blocked: copy ${copyId} is currently ${targetCopy.status}`,
            });
            return res.status(400).json({ message: 'Cannot delete a copy that is currently borrowed or pending' });
        }

        const updatedCopies = copies.filter((_, index) => index !== targetIndex);
        const availableCopies = updatedCopies.filter((copy) => normalizeString(copy.status) === 'available').length;

        const persistenceFilter = resolveBookPersistenceFilter(req, book);
        if (!persistenceFilter) {
            console.error('Unable to resolve persistence filter for delete copy', id);
            return res.status(500).json({ message: 'Failed to delete book copy' });
        }

        await req.dbAdapter.updateInCollection('books', persistenceFilter, {
            copies: updatedCopies,
            totalCopies: updatedCopies.length,
            availableCopies,
            updatedAt: new Date(),
        });
        await notifyInventoryState(req, { ...book, copies: updatedCopies, availableCopies }, 'book-delete-copy');

        setAuditContext(req, {
            entityId: book.id || book._id || id,
            description: `Deleted copy ${copyId} from ${book.title || id}`,
            details: {
                copyId,
                status: targetCopy.status,
            },
            metadata: {
                actorId: req.user.id,
            },
            success: true,
            status: 'Deleted',
        });

        return res.json({ message: 'Book copy deleted successfully' });
    } catch (error) {
        console.error('Delete copy error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: 'Failed to delete book copy',
            details: { error: error.message },
        });
        return res.status(500).json({ message: 'Failed to delete book copy' });
    }
});

router.get('/:id/copies/barcodes', verifyToken, requireStaff, logAction('GENERATE_BARCODES', 'book'), async(req, res) => {
    try {
        const book = await findBookByIdentifier(req, req.params.id);
        if (!book) {
            setAuditContext(req, {
                success: false,
                status: 'BookNotFound',
                description: `Generate barcodes failed: book ${req.params.id} not found`,
            });
            return res.status(404).json({ message: 'Book not found' });
        }

        const copies = Array.isArray(book.copies) ? book.copies : [];
        if (copies.length === 0) {
            setAuditContext(req, {
                success: false,
                status: 'NoCopies',
                description: `Generate barcodes failed: book ${req.params.id} has no copies`,
            });
            return res.status(404).json({ message: 'No copies available for this book' });
        }

        const copyIdsParam = req.query.copyIds;
        let requestedCopyIds = copies.map((copy) => copy.copyId).filter(Boolean);

        if (copyIdsParam) {
            const asArray = Array.isArray(copyIdsParam) ? copyIdsParam : String(copyIdsParam).split(',');
            const requestedSet = new Set(
                asArray
                    .map((value) => String(value).trim())
                    .filter(Boolean)
                    .map((value) => value.toUpperCase())
            );

            requestedCopyIds = copies
                .map((copy) => copy.copyId)
                .filter(Boolean)
                .filter((copyId) => requestedSet.has(String(copyId).toUpperCase()));

            if (requestedCopyIds.length === 0) {
                setAuditContext(req, {
                    success: false,
                    status: 'CopiesNotFound',
                    description: `Generate barcodes failed: requested reference IDs not found for book ${req.params.id}`,
                    details: {
                        requested: Array.from(requestedSet),
                    },
                });
                return res.status(404).json({ message: 'Requested reference IDs not found for this book' });
            }
        }

        const filteredCopies = copies
            .filter((copy) => Boolean(copy.copyId))
            .filter((copy) => requestedCopyIds.includes(copy.copyId));

        if (filteredCopies.length === 0) {
            setAuditContext(req, {
                success: false,
                status: 'CopiesNotFound',
                description: `Generate barcodes failed: no matching copies with IDs for book ${req.params.id}`,
                details: {
                    requested: requestedCopyIds,
                },
            });
            return res.status(404).json({ message: 'No matching copies found for barcode generation' });
        }

        const generatedBy = [req.user?.firstName, req.user?.lastName]
            .filter(Boolean)
            .join(' ') || req.user?.username || req.user?.email || null;

        const pdfPayload = await buildBarcodePdf({
            book,
            copies: filteredCopies,
            requestedCopyIds,
            generatedBy,
        });

        setAuditContext(req, {
            entityId: book.id || book._id || req.params.id,
            description: `Generated ${requestedCopyIds.length} barcode labels for ${book.title || req.params.id}`,
            success: true,
            status: 'Generated',
            details: {
                copyIds: requestedCopyIds,
            },
            metadata: {
                actorId: req.user?.id,
                filename: pdfPayload.filename,
            },
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfPayload.filename}"`);
        return res.send(pdfPayload.buffer);
    } catch (error) {
        console.error('Generate barcode PDF error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: 'Failed to generate barcodes',
            details: { error: error.message },
        });
        return res.status(500).json({ message: 'Failed to generate barcodes' });
    }
});

router.get('/:id/copies', verifyToken, async(req, res) => {
    try {
        const book = await findBookByIdentifier(req, req.params.id);
        if (!book) return res.status(404).json({ message: 'Book not found' });
        res.json(book.copies || []);
    } catch (error) {
        console.error('Get copies error:', error);
        res.status(500).json({ message: 'Failed to fetch book copies' });
    }
});

router.get('/:id/history', verifyToken, async(req, res) => {
    try {
        const book = await findBookByIdentifier(req, req.params.id);
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
            const copyIndex = book.copies?.findIndex(c => c.copyId === req.params.copyId);
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
        const persistenceFilter = resolveBookPersistenceFilter(req, targetBook);
        if (!persistenceFilter) {
            console.error('Unable to resolve persistence filter for copy update', targetBook?.id || targetBook?._id || 'unknown');
            return res.status(500).json({ message: 'Failed to update book copy' });
        }

        await req.dbAdapter.updateInCollection('books', persistenceFilter, { copies: updatedCopies, availableCopies, updatedAt: new Date() });
        setAuditContext(req, {
            entityId: targetBook.id || targetBook._id,
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
        allBooks.forEach(ensureAuthorMetadata);
        const results = [];
        for (const book of allBooks) {
            let matches = false;
            const authorMatches = () =>
                (Array.isArray(book.authors) && book.authors.some((author) => author?.toLowerCase().includes(searchLower))) ||
                (book.author && book.author.toLowerCase().includes(searchLower));
            switch (type) {
                case 'title':
                    matches = book.title?.toLowerCase().includes(searchLower);
                    break;
                case 'author':
                    matches = authorMatches();
                    break;
                case 'isbn':
                    matches = book.isbn?.toLowerCase().includes(searchLower);
                    break;
                case 'all':
                default:
                    matches = book.title?.toLowerCase().includes(searchLower) || authorMatches() || book.isbn?.toLowerCase().includes(searchLower) || book.publisher?.toLowerCase().includes(searchLower) || book.category?.toLowerCase().includes(searchLower);
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
