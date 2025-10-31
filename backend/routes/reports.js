const express = require('express');
const router = express.Router();

// Get library statistics
router.get('/stats', async(req, res) => {
    try {
        console.log('📊 Stats endpoint called, checking database adapter...');

        if (!req.dbAdapter) {
            console.error('❌ Database adapter not found in request');
            return res.status(500).json({ message: 'Database adapter not available' });
        }

        console.log('📊 Fetching data from offline database...');

        // Get data from offline database
        const books = await req.dbAdapter.findInCollection('books', {});
        const users = await req.dbAdapter.findInCollection('users', {});
        const transactions = await req.dbAdapter.findInCollection('transactions', {});

        console.log('📊 Data fetched:', { booksCount: books.length, usersCount: users.length, transactionsCount: transactions.length });

        // Calculate real statistics from actual data
        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - (30 * 60 * 1000)); // 30 minutes ago
        const activeUsers = users.filter(u => u.lastActivityAt && new Date(u.lastActivityAt) > thirtyMinutesAgo);

        console.log(`📊 Activity tracking: ${activeUsers.length} users active in last 30 minutes`);
        activeUsers.forEach(u => console.log(`  - ${u.firstName} ${u.lastName} (${u.role}) - last seen: ${u.lastActivityAt}`));

        // Calculate borrowed books (status = 'borrowed' and no return date)
        const borrowedTransactions = transactions.filter(t =>
            t.status === 'borrowed' && !t.returnDate
        );

        // Calculate overdue books (due date passed and still borrowed)
        const overdueTransactions = borrowedTransactions.filter(t => {
            if (!t.dueDate) return false;
            const dueDate = new Date(t.dueDate);
            return dueDate < now;
        });

        // Calculate returned books
        const returnedTransactions = transactions.filter(t =>
            t.status === 'returned' || t.returnDate
        );

        // Calculate missing books
        const missingTransactions = transactions.filter(t =>
            t.status === 'missing'
        );

        const stats = {
            totalBooks: books.length,
            borrowedBooks: borrowedTransactions.length,
            returnedBooks: returnedTransactions.length,
            overdueBooks: overdueTransactions.length,
            missingBooks: missingTransactions.length,
            visitors: activeUsers.length,
            newStudents: users.filter(u => u.role === 'student').length,
            totalUsers: users.length,
            activeUsers: users.filter(u => u.isActive !== false).length,
            totalTransactions: transactions.length,
            totalFinesCollected: transactions.reduce((sum, t) => sum + (t.fineAmount || 0), 0)
        };

        console.log('📊 Calculated stats:', stats);
        res.json(stats);
    } catch (error) {
        console.error('❌ Error in stats endpoint:', error);
        res.status(500).json({
            message: 'Failed to fetch statistics',
            error: error.message,
            stack: error.stack
        });
    }
});

// Get daily trends
router.get('/trends/daily', async(req, res) => {
    try {
        const transactions = await req.dbAdapter.findInCollection('transactions', {});

        // Group transactions by date for last 30 days instead of 7
        const trends = [];
        console.log('Generating trends for last 30 days...');
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            const dateStr = date.toISOString().split('T')[0];

            const dayBorrows = transactions.filter(t => {
                if (!t.borrowDate && !t.createdAt) return false;
                const tDate = new Date(t.borrowDate || t.createdAt);
                return tDate.toISOString().split('T')[0] === dateStr && t.status === 'borrowed';
            });

            const dayReturns = transactions.filter(t => {
                if (!t.returnDate && !t.returnedDate) return false;
                const tDate = new Date(t.returnDate || t.returnedDate);
                return tDate.toISOString().split('T')[0] === dateStr && t.status === 'returned';
            });

            trends.push({
                date: dateStr,
                borrows: dayBorrows.length,
                returns: dayReturns.length
            });
        }
        console.log('Generated trends:', trends.length, 'items');

        res.json(trends);
    } catch (error) {
        console.error('Trends error:', error);
        res.json([]);
    }
});

// Get recent overdue books
router.get('/overdue/recent', async(req, res) => {
    try {
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const users = await req.dbAdapter.findInCollection('users', {});
        const books = await req.dbAdapter.findInCollection('books', {});

        const now = new Date();

        // Find overdue transactions
        const overdueTransactions = transactions.filter(t => {
            if (t.status !== 'borrowed' || t.returnDate) return false;
            if (!t.dueDate) return false;
            const dueDate = new Date(t.dueDate);
            return dueDate < now;
        });

        // Enrich with user and book details
        const overdueBooks = overdueTransactions.map(trans => {
            const user = users.find(u => u.id === trans.userId || u._id === trans.userId);
            let bookTitle = 'Unknown Book';

            if (trans.items && trans.items.length > 0) {
                const item = trans.items[0];
                const book = books.find(b => b.id === item.bookId || b._id === item.bookId);
                if (book) bookTitle = book.title;
            }

            return {
                transactionId: trans.id || trans._id,
                studentId: user ? user.studentId : '',
                student: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
                title: bookTitle,
                dueDate: trans.dueDate,
                borrowDate: trans.borrowDate,
                daysOverdue: Math.floor((now - new Date(trans.dueDate)) / (1000 * 60 * 60 * 24))
            };
        });

        res.json(overdueBooks);
    } catch (error) {
        console.error('Overdue error:', error);
        res.status(500).json({ message: 'Failed to fetch overdue books' });
    }
});

// Get recent transactions
router.get('/transactions/recent', async(req, res) => {
    try {
        if (req.dbAdapter) {
            const transactions = await req.dbAdapter.findInCollection('transactions', {});
            const users = await req.dbAdapter.findInCollection('users', {});
            const books = await req.dbAdapter.findInCollection('books', {});

            // Return last 10 transactions with enriched data
            const recent = transactions.slice(-10).reverse();

            // Enrich with user and book details
            const enrichedTransactions = recent.map(trans => {
                const user = users.find(u => u.id === trans.userId || u._id === trans.userId);
                let bookTitle = 'Unknown Book';
                let author = 'Unknown Author';
                let isbn = '';

                if (trans.items && trans.items.length > 0) {
                    const item = trans.items[0];
                    const book = books.find(b => b.id === item.bookId || b._id === item.bookId);
                    if (book) {
                        bookTitle = book.title;
                        author = book.author;
                        isbn = book.isbn;
                    }
                }

                return {
                    ...trans,
                    studentId: user ? user.studentId : '',
                    student: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
                    title: bookTitle,
                    author: author,
                    isbn: isbn,
                    recordDate: trans.borrowDate,
                    returnedDate: trans.returnDate
                };
            });

            res.json(enrichedTransactions);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Recent transactions error:', error);
        res.json([]);
    }
});

// Dashboard report with date range
router.get('/dashboard', async(req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const books = await req.dbAdapter.findInCollection('books', {});
        const users = await req.dbAdapter.findInCollection('users', {});

        let filteredTransactions = transactions;
        if (startDate && endDate) {
            filteredTransactions = transactions.filter(t => {
                const tDate = new Date(t.borrowDate || t.createdAt);
                return tDate >= new Date(startDate) && tDate <= new Date(endDate);
            });
        }

        // Calculate popular books (support transactions that store books under t.books or t.items)
        const bookBorrowCounts = {};
        filteredTransactions.forEach(t => {
            if (t.books && Array.isArray(t.books)) {
                t.books.forEach(book => {
                    const bid = book.id || book._id || book.bookId;
                    if (bid) bookBorrowCounts[bid] = (bookBorrowCounts[bid] || 0) + 1;
                });
            } else if (t.items && Array.isArray(t.items)) {
                t.items.forEach(item => {
                    const bid = item.bookId || item.book_id || item.book;
                    if (bid) bookBorrowCounts[bid] = (bookBorrowCounts[bid] || 0) + 1;
                });
            }
        });

        const popularBooks = Object.entries(bookBorrowCounts)
            .map(([bookId, count]) => {
                const book = books.find(b => b.id === bookId || b._id === bookId) || {};
                return {
                    id: bookId,
                    title: book.title || 'Unknown',
                    author: book.author || 'Unknown',
                    borrowCount: count
                };
            })
            .sort((a, b) => b.borrowCount - a.borrowCount)
            .slice(0, 10);

        // Get recent activity (include items[] fallback for bookCount)
        const recentActivity = filteredTransactions
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10)
            .map(t => ({
                id: t.id,
                type: t.status,
                date: t.borrowDate || t.createdAt,
                userId: t.userId,
                bookCount: t.books ? t.books.length : (t.items ? t.items.length : 0)
            }));

        res.json({
            totalTransactions: filteredTransactions.length,
            totalBooks: books.length,
            totalUsers: users.length,
            activeTransactions: filteredTransactions.filter(t => t.status === 'borrowed').length,
            popularBooks: popularBooks,
            recentActivity: recentActivity
        });
    } catch (error) {
        console.error('Dashboard report error:', error);
        res.status(500).json({ message: 'Failed to fetch dashboard report' });
    }
});

// Circulation report
router.get('/circulation', async(req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const users = await req.dbAdapter.findInCollection('users', {});

        let filtered = transactions;
        if (startDate && endDate) {
            filtered = transactions.filter(t => {
                const tDate = new Date(t.borrowDate || t.createdAt);
                return tDate >= new Date(startDate) && tDate <= new Date(endDate);
            });
        }

        // Group by date
        const dailyData = {};
        filtered.forEach(t => {
            const date = new Date(t.borrowDate || t.createdAt).toDateString();
            if (!dailyData[date]) {
                dailyData[date] = { date, borrowed: 0, returned: 0, newUsers: 0, finesCollected: 0 };
            }
            if (t.status === 'borrowed') dailyData[date].borrowed++;
            if (t.status === 'returned') dailyData[date].returned++;
            if (t.fine && t.finePaid) dailyData[date].finesCollected += t.fine;
        });

        // Count new users in date range
        if (startDate && endDate) {
            users.forEach(u => {
                const userDate = new Date(u.createdAt).toDateString();
                if (dailyData[userDate]) {
                    dailyData[userDate].newUsers++;
                }
            });
        }

        // Convert to array and sort by date
        const result = Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
        res.json(result);
    } catch (error) {
        console.error('Circulation report error:', error);
        res.status(500).json({ message: 'Failed to fetch circulation report' });
    }
});

// Popular books report
router.get('/popular-books', async(req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const books = await req.dbAdapter.findInCollection('books', {});

        let filtered = transactions;
        if (startDate && endDate) {
            filtered = transactions.filter(t => {
                const tDate = new Date(t.borrowDate || t.createdAt);
                return tDate >= new Date(startDate) && tDate <= new Date(endDate);
            });
        }

        // Count book borrows (support t.books and t.items)
        const bookCounts = {};
        filtered.forEach(t => {
            if (t.books && Array.isArray(t.books)) {
                t.books.forEach(book => {
                    const bid = book.id || book._id || book.bookId;
                    if (bid) bookCounts[bid] = (bookCounts[bid] || 0) + 1;
                });
            } else if (t.items && Array.isArray(t.items)) {
                t.items.forEach(item => {
                    const bid = item.bookId || item.book_id || item.book;
                    if (bid) bookCounts[bid] = (bookCounts[bid] || 0) + 1;
                });
            }
        });

        // Convert to array with book details and sort
        const popularBooks = Object.entries(bookCounts)
            .map(([bookId, count]) => {
                const book = books.find(b => b.id === bookId);
                return {
                    id: bookId,
                    title: book ? book.title : 'Unknown',
                    author: book ? book.author : 'Unknown',
                    category: book ? book.category : 'Uncategorized',
                    borrowCount: count,
                    averageRating: book ? book.rating : null
                };
            })
            .sort((a, b) => b.borrowCount - a.borrowCount)
            .slice(0, 20);

        res.json(popularBooks);
    } catch (error) {
        console.error('Popular books error:', error);
        res.status(500).json({ message: 'Failed to fetch popular books' });
    }
});

// User activity report
router.get('/user-activity', async(req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const users = await req.dbAdapter.findInCollection('users', {});

        let filtered = transactions;
        if (startDate && endDate) {
            filtered = transactions.filter(t => {
                const tDate = new Date(t.borrowDate || t.createdAt);
                return tDate >= new Date(startDate) && tDate <= new Date(endDate);
            });
        }

        // Count user activity
        const userActivity = {};
        filtered.forEach(t => {
            if (!userActivity[t.userId]) {
                userActivity[t.userId] = { borrowed: 0, returned: 0, totalFines: 0, lastActivity: t.createdAt };
            }
            if (t.status === 'borrowed') userActivity[t.userId].borrowed++;
            if (t.status === 'returned') userActivity[t.userId].returned++;
            if (t.fine) userActivity[t.userId].totalFines += t.fine;
            if (new Date(t.createdAt) > new Date(userActivity[t.userId].lastActivity)) {
                userActivity[t.userId].lastActivity = t.createdAt;
            }
        });

        // Convert to array with user details
        const result = Object.entries(userActivity).map(([userId, activity]) => {
            const user = users.find(u => u.id === userId);
            return {
                id: userId,
                name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
                role: user ? user.role : 'Unknown',
                borrowed: activity.borrowed,
                returned: activity.returned,
                totalFines: activity.totalFines,
                lastActivity: activity.lastActivity
            };
        }).sort((a, b) => b.borrowed - a.borrowed);

        res.json(result);
    } catch (error) {
        console.error('User activity error:', error);
        res.status(500).json({ message: 'Failed to fetch user activity' });
    }
});

// Fines report
router.get('/fines', async(req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const users = await req.dbAdapter.findInCollection('users', {});
        const books = await req.dbAdapter.findInCollection('books', {});

        let filtered = transactions;
        if (startDate && endDate) {
            filtered = transactions.filter(t => {
                const tDate = new Date(t.returnDate || t.createdAt);
                return tDate >= new Date(startDate) && tDate <= new Date(endDate);
            });
        }

        // Get transactions with fines
        const fineTransactions = filtered
            .filter(t => (t.fine || 0) > 0)
            .map(t => {
                const user = users.find(u => u.id === t.userId);
                const bookTitles = t.books && t.books.length > 0 ?
                    t.books.map(b => b.title || 'Unknown').join(', ') :
                    'Unknown';

                return {
                    id: t.id,
                    date: t.returnDate || t.createdAt,
                    userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
                    bookTitle: bookTitles,
                    amount: t.fine || 0,
                    reason: 'Late Return',
                    status: t.finePaid ? 'paid' : 'unpaid'
                };
            });

        res.json(fineTransactions);
    } catch (error) {
        console.error('Fines report error:', error);
        res.status(500).json({ message: 'Failed to fetch fines report' });
    }
});

// Inventory report
router.get('/inventory', async(req, res) => {
    try {
        const books = await req.dbAdapter.findInCollection('books', {});

        // Map each book to inventory details
        const result = books.map(book => {
            let totalCopies = 0;
            let available = 0;
            let borrowed = 0;
            let lostDamaged = 0;

            if (book.copies && Array.isArray(book.copies)) {
                totalCopies = book.copies.length;
                available = book.copies.filter(c => c.status === 'available').length;
                borrowed = book.copies.filter(c => c.status === 'borrowed').length;
                lostDamaged = book.copies.filter(c => c.status === 'lost' || c.status === 'damaged').length;
            }

            return {
                id: book.id,
                title: book.title || 'Unknown',
                author: book.author || 'Unknown',
                category: book.category || 'Uncategorized',
                totalCopies,
                available,
                borrowed,
                lostDamaged
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Inventory report error:', error);
        res.status(500).json({ message: 'Failed to fetch inventory report' });
    }
});

// Overdue report
router.get('/overdue', async(req, res) => {
    try {
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const users = await req.dbAdapter.findInCollection('users', {});
        const books = await req.dbAdapter.findInCollection('books', {});
        const now = new Date();

        const overdueTransactions = transactions.filter(t => {
            if (t.status !== 'borrowed') return false;
            const dueDate = new Date(t.dueDate);
            return dueDate < now;
        });

        // Map to frontend structure
        const result = overdueTransactions.map(t => {
            const user = users.find(u => u.id === t.userId);
            const dueDate = new Date(t.dueDate);
            const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
            const fine = daysOverdue * 5; // $5 per day fine

            // Get book titles (support t.items fallback)
            const bookTitles = (t.books && t.books.length > 0)
                ? t.books.map(b => b.title || 'Unknown').join(', ')
                : (t.items && t.items.length > 0)
                    ? t.items.map(it => it.title || it.isbn || it.bookId || 'Unknown').join(', ')
                    : 'Unknown';

            return {
                id: t.id,
                bookTitle: bookTitles,
                borrowerName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
                dueDate: t.dueDate,
                daysOverdue,
                fine,
                status: daysOverdue > 30 ? 'Critical' : 'Overdue'
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Overdue report error:', error);
        res.status(500).json({ message: 'Failed to fetch overdue report' });
    }
});

module.exports = router;

// Export reports as CSV
router.get('/export/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { startDate, endDate } = req.query;

        if (!req.dbAdapter) {
            return res.status(500).json({ message: 'Database adapter not available' });
        }

        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const users = await req.dbAdapter.findInCollection('users', {});
        const books = await req.dbAdapter.findInCollection('books', {});

        // Helper: convert array of objects to CSV string
        const toCSV = (arr) => {
            if (!Array.isArray(arr) || arr.length === 0) return '';
            const headers = Object.keys(arr[0]);
            const escape = (v) => {
                if (v === null || v === undefined) return '';
                const s = String(v);
                if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                    return '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            };
            const rows = [headers.join(',')];
            arr.forEach(r => {
                const row = headers.map(h => escape(r[h]));
                rows.push(row.join(','));
            });
            return rows.join('\n');
        };

        let data = [];

        switch ((type || '').toLowerCase()) {
            case 'circulation': {
                // reuse circulation logic: group by date
                let filtered = transactions;
                if (startDate && endDate) {
                    filtered = transactions.filter(t => {
                        const tDate = new Date(t.borrowDate || t.createdAt);
                        return tDate >= new Date(startDate) && tDate <= new Date(endDate);
                    });
                }
                const dailyData = {};
                filtered.forEach(t => {
                    const date = new Date(t.borrowDate || t.createdAt).toDateString();
                    if (!dailyData[date]) dailyData[date] = { date, borrowed: 0, returned: 0, newUsers: 0, finesCollected: 0 };
                    if (t.status === 'borrowed') dailyData[date].borrowed++;
                    if (t.status === 'returned') dailyData[date].returned++;
                    if (t.fine && t.finePaid) dailyData[date].finesCollected += t.fine;
                });
                if (startDate && endDate) {
                    // count new users
                    users.forEach(u => {
                        const userDate = new Date(u.createdAt).toDateString();
                        if (dailyData[userDate]) dailyData[userDate].newUsers++;
                    });
                }
                data = Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
                break;
            }
            case 'popular-books': {
                let filtered = transactions;
                if (startDate && endDate) {
                    filtered = transactions.filter(t => {
                        const tDate = new Date(t.borrowDate || t.createdAt);
                        return tDate >= new Date(startDate) && tDate <= new Date(endDate);
                    });
                }
                const bookCounts = {};
                filtered.forEach(t => {
                    if (t.books && Array.isArray(t.books)) {
                        t.books.forEach(b => {
                            bookCounts[b.id] = (bookCounts[b.id] || 0) + 1;
                        });
                    } else if (t.items && Array.isArray(t.items)) {
                        t.items.forEach(it => {
                            const bookId = it.bookId || it.book_id || it.book;
                            if (bookId) bookCounts[bookId] = (bookCounts[bookId] || 0) + 1;
                        });
                    }
                });
                data = Object.entries(bookCounts).map(([bookId, count]) => {
                    const book = books.find(b => b.id === bookId || b._id === bookId) || {};
                    return {
                        id: bookId,
                        title: book.title || 'Unknown',
                        author: book.author || 'Unknown',
                        category: book.category || 'Uncategorized',
                        borrowCount: count,
                        averageRating: book.rating || ''
                    };
                }).sort((a, b) => b.borrowCount - a.borrowCount).slice(0, 1000);
                break;
            }
            case 'user-activity': {
                let filtered = transactions;
                if (startDate && endDate) {
                    filtered = transactions.filter(t => {
                        const tDate = new Date(t.borrowDate || t.createdAt);
                        return tDate >= new Date(startDate) && tDate <= new Date(endDate);
                    });
                }
                const userActivity = {};
                filtered.forEach(t => {
                    if (!userActivity[t.userId]) userActivity[t.userId] = { borrowed: 0, returned: 0, totalFines: 0, lastActivity: t.createdAt };
                    if (t.status === 'borrowed') userActivity[t.userId].borrowed++;
                    if (t.status === 'returned') userActivity[t.userId].returned++;
                    if (t.fine) userActivity[t.userId].totalFines += t.fine;
                    if (new Date(t.createdAt) > new Date(userActivity[t.userId].lastActivity)) userActivity[t.userId].lastActivity = t.createdAt;
                });
                data = Object.entries(userActivity).map(([userId, activity]) => {
                    const user = users.find(u => u.id === userId || u._id === userId) || {};
                    return {
                        id: userId,
                        name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown',
                        role: user.role || '',
                        borrowed: activity.borrowed,
                        returned: activity.returned,
                        totalFines: activity.totalFines,
                        lastActivity: activity.lastActivity
                    };
                }).sort((a, b) => b.borrowed - a.borrowed);
                break;
            }
            case 'overdue': {
                const now = new Date();
                const overdueTransactions = transactions.filter(t => {
                    if (t.status !== 'borrowed') return false;
                    if (!t.dueDate) return false;
                    const dueDate = new Date(t.dueDate);
                    return dueDate < now;
                });
                data = overdueTransactions.map(t => {
                    const user = users.find(u => u.id === t.userId || u._id === t.userId) || {};
                    const bookTitles = t.books && t.books.length > 0 ? t.books.map(b => b.title || 'Unknown').join(', ') : (t.items && t.items.length > 0 ? (t.items.map(it => it.title || it.isbn || it.bookId).join(', ')) : 'Unknown');
                    const dueDate = t.dueDate;
                    const daysOverdue = Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24));
                    const fine = daysOverdue * 5;
                    return {
                        id: t.id || t._id,
                        bookTitle: bookTitles,
                        borrowerName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown',
                        dueDate: dueDate,
                        daysOverdue,
                        fine,
                        status: daysOverdue > 30 ? 'Critical' : 'Overdue'
                    };
                });
                break;
            }
            case 'fines': {
                let filtered = transactions;
                if (startDate && endDate) {
                    filtered = transactions.filter(t => {
                        const tDate = new Date(t.returnDate || t.createdAt);
                        return tDate >= new Date(startDate) && tDate <= new Date(endDate);
                    });
                }
                const fineTransactions = filtered.filter(t => (t.fine || 0) > 0).map(t => {
                    const user = users.find(u => u.id === t.userId || u._id === t.userId) || {};
                    const bookTitles = t.books && t.books.length > 0 ? t.books.map(b => b.title || 'Unknown').join(', ') : (t.items && t.items.length > 0 ? t.items.map(it => it.title || it.isbn || it.bookId).join(', ') : 'Unknown');
                    return {
                        id: t.id || t._id,
                        date: t.returnDate || t.createdAt,
                        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown',
                        bookTitle: bookTitles,
                        amount: t.fine || 0,
                        reason: 'Late Return',
                        status: t.finePaid ? 'paid' : 'unpaid'
                    };
                });
                data = fineTransactions;
                break;
            }
            case 'inventory': {
                data = books.map(book => {
                    let totalCopies = 0;
                    let available = 0;
                    let borrowed = 0;
                    let lostDamaged = 0;
                    if (book.copies && Array.isArray(book.copies)) {
                        totalCopies = book.copies.length;
                        available = book.copies.filter(c => c.status === 'available').length;
                        borrowed = book.copies.filter(c => c.status === 'borrowed').length;
                        lostDamaged = book.copies.filter(c => c.status === 'lost' || c.status === 'damaged').length;
                    }
                    return {
                        id: book.id,
                        title: book.title || 'Unknown',
                        author: book.author || 'Unknown',
                        category: book.category || 'Uncategorized',
                        totalCopies,
                        available,
                        borrowed,
                        lostDamaged
                    };
                });
                break;
            }
            case 'transactions_recent':
            case 'transactions-recent':
            case 'recent-transactions': {
                const recent = transactions.slice(-100).reverse();
                data = recent.map(t => {
                    const user = users.find(u => u.id === t.userId || u._id === t.userId) || {};
                    let bookTitle = 'Unknown';
                    if (t.items && t.items.length > 0) {
                        const item = t.items[0];
                        const book = books.find(b => b.id === item.bookId || b._id === item.bookId);
                        if (book) bookTitle = book.title;
                    }
                    return {
                        id: t.id || t._id,
                        studentId: user ? user.studentId : '',
                        student: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown',
                        title: bookTitle,
                        author: '',
                        isbn: '',
                        recordDate: t.borrowDate,
                        returnedDate: t.returnDate
                    };
                });
                break;
            }
            default:
                return res.status(400).json({ message: 'Unknown export type' });
        }

        const csv = toCSV(data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_report.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Export report error:', error);
        res.status(500).json({ message: 'Failed to export report' });
    }
});