const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');

try {
    console.log('📚 Reading current data...');

    // Read all data files
    const books = JSON.parse(fs.readFileSync(path.join(dataDir, 'books.json'), 'utf8'));
    const users = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'));

    console.log(`✅ Found ${books.length} books`);
    console.log(`✅ Found ${users.length} users`);

    // Get students only
    const students = users.filter(u => u.role === 'student');
    console.log(`✅ Found ${students.length} students`);

    // Get books with available copies
    const booksWithCopies = books.filter(b => b.copies && b.copies.length > 0);
    console.log(`✅ Found ${booksWithCopies.length} books with copies`);

    if (students.length < 10 || booksWithCopies.length < 15) {
        console.error('❌ Not enough students or books to create proper test data');
        console.error(`   Need at least 10 students and 15 books, have ${students.length} students and ${booksWithCopies.length} books`);
        process.exit(1);
    }

    // Generate unique transaction ID
    const generateId = (prefix) => {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };

    const transactions = [];
    let copyIndex = 0;

    // 1. Create 10 BORROWED transactions (currently borrowed, not overdue)
    console.log('\n📖 Creating 10 borrowed transactions...');
    for (let i = 0; i < 10; i++) {
        const student = students[i];
        const book = booksWithCopies[copyIndex];
        const copy = book.copies[0];

        const borrowDate = new Date('2025-10-05');
        borrowDate.setDate(borrowDate.getDate() + i); // Stagger dates

        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + 14); // Due in 14 days

        transactions.push({
            id: generateId('trans'),
            userId: student._id,
            items: [{
                copyId: copy.copyId,
                bookId: book._id,
                isbn: book.isbn,
                status: 'borrowed'
            }],
            type: 'regular',
            status: 'borrowed',
            borrowDate: borrowDate.toISOString(),
            dueDate: dueDate.toISOString(),
            returnDate: null,
            fineAmount: 0,
            notes: 'Currently borrowed - not overdue',
            renewalCount: 0,
            createdAt: borrowDate.toISOString(),
            updatedAt: borrowDate.toISOString(),
            createdBy: users.find(u => u.role === 'admin')._id,
            _id: generateId('mg')
        });

        copyIndex++;
    }

    // 2. Create 3 OVERDUE transactions (borrowed and past due date)
    console.log('⏰ Creating 3 overdue transactions...');
    for (let i = 0; i < 3; i++) {
        const student = students[(10 + i) % students.length]; // Use modulo to wrap around
        const book = booksWithCopies[copyIndex];
        const copy = book.copies[0];

        const borrowDate = new Date('2025-09-15');
        borrowDate.setDate(borrowDate.getDate() + i * 3); // Stagger dates

        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + 14); // Due 14 days after borrow

        transactions.push({
            id: generateId('trans'),
            userId: student._id,
            items: [{
                copyId: copy.copyId,
                bookId: book._id,
                isbn: book.isbn,
                status: 'borrowed'
            }],
            type: 'regular',
            status: 'borrowed',
            borrowDate: borrowDate.toISOString(),
            dueDate: dueDate.toISOString(),
            returnDate: null,
            fineAmount: 0,
            notes: 'OVERDUE - past due date',
            renewalCount: 0,
            createdAt: borrowDate.toISOString(),
            updatedAt: borrowDate.toISOString(),
            createdBy: users.find(u => u.role === 'admin')._id,
            _id: generateId('mg')
        });

        copyIndex++;
    }

    // 3. Create 3 RETURNED transactions
    console.log('✅ Creating 3 returned transactions...');
    for (let i = 0; i < 3; i++) {
        const student = students[(13 + i) % students.length]; // Use modulo to wrap around
        const book = booksWithCopies[copyIndex];
        const copy = book.copies[0];

        const borrowDate = new Date('2025-09-20');
        borrowDate.setDate(borrowDate.getDate() + i * 2);

        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + 14);

        const returnDate = new Date(borrowDate);
        returnDate.setDate(returnDate.getDate() + 10); // Returned after 10 days

        transactions.push({
            id: generateId('trans'),
            userId: student._id,
            items: [{
                copyId: copy.copyId,
                bookId: book._id,
                isbn: book.isbn,
                status: 'returned'
            }],
            type: 'regular',
            status: 'returned',
            borrowDate: borrowDate.toISOString(),
            dueDate: dueDate.toISOString(),
            returnDate: returnDate.toISOString(),
            fineAmount: 0,
            notes: 'Returned on time',
            renewalCount: 0,
            createdAt: borrowDate.toISOString(),
            updatedAt: returnDate.toISOString(),
            createdBy: users.find(u => u.role === 'admin')._id,
            _id: generateId('mg')
        });

        copyIndex++;
    }

    // 4. Create 2 MISSING transactions
    console.log('❌ Creating 2 missing transactions...');
    for (let i = 0; i < 2; i++) {
        const student = students[i % students.length]; // Reuse students
        const book = booksWithCopies[copyIndex % booksWithCopies.length]; // Wrap around if needed
        const copy = book.copies[0];

        const borrowDate = new Date('2025-08-01');
        borrowDate.setDate(borrowDate.getDate() + i * 5);

        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + 14);

        transactions.push({
            id: generateId('trans'),
            userId: student._id,
            items: [{
                copyId: copy.copyId,
                bookId: book._id,
                isbn: book.isbn,
                status: 'missing'
            }],
            type: 'regular',
            status: 'missing',
            borrowDate: borrowDate.toISOString(),
            dueDate: dueDate.toISOString(),
            returnDate: null,
            fineAmount: 50,
            notes: 'Book reported as lost/missing',
            renewalCount: 0,
            createdAt: borrowDate.toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: users.find(u => u.role === 'admin')._id,
            _id: generateId('mg')
        });

        copyIndex++;
    }

    // Backup old transactions
    const transPath = path.join(dataDir, 'transactions.json');
    if (fs.existsSync(transPath)) {
        fs.copyFileSync(transPath, path.join(dataDir, 'transactions.json.backup-' + Date.now()));
        console.log('\n💾 Backed up old transactions');
    }

    // Write new transactions
    fs.writeFileSync(transPath, JSON.stringify(transactions, null, 2), 'utf8');

    console.log('\n✅ SUCCESS! Created clean transaction data:');
    console.log(`   - 10 borrowed books (not overdue)`);
    console.log(`   - 3 overdue books (past due date)`);
    console.log(`   - 3 returned books`);
    console.log(`   - 2 missing books`);
    console.log(`   = ${transactions.length} total transactions`);

    console.log('\n📊 All transactions have valid book and student IDs!');
    console.log('🔄 Restart the server to see the updated data.');

} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
}