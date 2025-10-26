const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const { generateTransactionId } = require('../utils/transactionIds');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || process.env.MONGODB_DB_NAME || 'olms';

if (!uri) {
  console.error('❌ Missing MONGODB_URI. Update backend/.env before running this script.');
  process.exit(1);
}

const dt = (value) => new Date(value);

const buildBorrowingStats = ({ totalBorrowed = 0, currentlyBorrowed = 0, totalFines = 0, totalReturned = 0 }) => ({
  totalBorrowed,
  currentlyBorrowed,
  totalFines,
  totalReturned
});

const buildCopy = ({
  copyId,
  status = 'available',
  condition = 'good',
  location,
  createdAt,
  updatedAt,
  createdBy,
  updatedBy
}) => ({
  copyId,
  status,
  condition,
  location,
  createdAt: dt(createdAt),
  updatedAt: dt(updatedAt),
  createdBy,
  ...(updatedBy ? { updatedBy } : {})
});

const cleanCollection = async (db, name) => {
  const result = await db.collection(name).deleteMany({});
  console.log(`🧹 Cleared ${name}: ${result.deletedCount} document(s)`);
};

(async () => {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });

  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await client.connect();
    const db = client.db(dbName);

    const adapterCollections = ['users', 'books', 'transactions', 'settings', 'audit', 'annualSets'];
    for (const name of adapterCollections) {
      await cleanCollection(db, name);
    }

    console.log('🧬 Preparing new interconnected seed data...');

    const [
      adminPassword,
      librarianPassword,
      staffPassword,
      alyssaPassword,
      benPassword,
      carlaPassword
    ] = await Promise.all([
      bcrypt.hash('admin123456', 10),
      bcrypt.hash('librarian123!', 10),
      bcrypt.hash('staff123!', 10),
      bcrypt.hash('alyssa123!', 10),
      bcrypt.hash('ben123!', 10),
      bcrypt.hash('carla123!', 10)
    ]);

    const adminId = new ObjectId();
    const librarianId = new ObjectId();
    const staffId = new ObjectId();
    const alyssaId = new ObjectId();
    const benId = new ObjectId();
    const carlaId = new ObjectId();

    const adminIdStr = adminId.toString();
    const librarianIdStr = librarianId.toString();
    const staffIdStr = staffId.toString();
    const alyssaIdStr = alyssaId.toString();
    const benIdStr = benId.toString();
    const carlaIdStr = carlaId.toString();

    const users = [
      {
        _id: adminId,
        id: adminIdStr,
        username: 'admin',
        email: 'admin@olms.com',
        password: adminPassword,
        firstName: 'Aurelia',
        lastName: 'Del Rosario',
        role: 'admin',
        isActive: true,
        profile: {
          phone: '09170000001',
          address: 'Quezon City',
          dateOfBirth: dt('1985-04-18T00:00:00Z')
        },
        library: {
          cardNumber: 'ADMIN-0001',
          membershipDate: dt('2022-06-01T00:00:00Z'),
          borrowingLimit: 999,
          fineBalance: 0
        },
        borrowingStats: buildBorrowingStats({}),
        createdAt: dt('2022-06-01T00:00:00Z'),
        updatedAt: dt('2025-09-20T01:00:00Z'),
        lastLoginAt: dt('2025-09-20T01:15:00Z'),
        lastActivityAt: dt('2025-09-20T01:30:00Z')
      },
      {
        _id: librarianId,
        id: librarianIdStr,
        username: 'librarian.jane',
        email: 'jane.delacruz@olms.edu',
        password: librarianPassword,
        firstName: 'Jane',
        lastName: 'Dela Cruz',
        role: 'librarian',
        isActive: true,
        profile: {
          phone: '09170000002',
          address: 'Mandaluyong City',
          dateOfBirth: dt('1990-02-09T00:00:00Z')
        },
        library: {
          cardNumber: 'LIB-STF-0002',
          membershipDate: dt('2023-04-10T00:00:00Z'),
          borrowingLimit: 20,
          fineBalance: 0
        },
        borrowingStats: buildBorrowingStats({ totalBorrowed: 4, currentlyBorrowed: 0, totalReturned: 4 }),
        createdAt: dt('2023-04-10T00:00:00Z'),
        updatedAt: dt('2025-09-18T05:10:00Z'),
        lastLoginAt: dt('2025-09-18T05:00:00Z'),
        lastActivityAt: dt('2025-09-18T05:45:00Z')
      },
      {
        _id: staffId,
        id: staffIdStr,
        username: 'staff.mike',
        email: 'mike.reyes@olms.edu',
        password: staffPassword,
        firstName: 'Michael',
        lastName: 'Reyes',
        role: 'staff',
        isActive: true,
        profile: {
          phone: '09170000003',
          address: 'Pasig City',
          dateOfBirth: dt('1988-11-02T00:00:00Z')
        },
        library: {
          cardNumber: 'LIB-STF-0003',
          membershipDate: dt('2023-05-22T00:00:00Z'),
          borrowingLimit: 10,
          fineBalance: 60
        },
        borrowingStats: buildBorrowingStats({ totalBorrowed: 2, currentlyBorrowed: 0, totalFines: 60, totalReturned: 2 }),
        createdAt: dt('2023-05-22T00:00:00Z'),
        updatedAt: dt('2025-09-14T09:20:00Z'),
        lastLoginAt: dt('2025-09-14T09:00:00Z'),
        lastActivityAt: dt('2025-09-14T09:30:00Z')
      },
      {
        _id: alyssaId,
        id: alyssaIdStr,
        username: 'alyssa.gomez',
        email: 'alyssa.gomez@student.olms.edu',
        password: alyssaPassword,
        firstName: 'Alyssa',
        middleName: 'Reyes',
        lastName: 'Gomez',
        role: 'student',
        isActive: true,
        libraryCardNumber: 'LIB-25-0001',
        studentId: '2025-1001',
        lrn: '123456789101',
        grade: 'Grade 11',
  section: 'ICT-A',
  curriculum: 'Senior High - ICT',
        barangay: 'Barangay San Juan',
        municipality: 'Quezon City',
        province: 'Metro Manila',
        fullAddress: '123 Learning St, Barangay San Juan, Quezon City',
        parentGuardianName: 'Maria Gomez',
        parentOccupation: 'Engineer',
        parentAddress: '123 Learning St, Quezon City',
        parentPhone: '09171234567',
        parentEmail: 'maria.gomez@example.com',
        phoneNumber: '09180001111',
        borrowingStats: buildBorrowingStats({ totalBorrowed: 1, currentlyBorrowed: 1, totalReturned: 0 }),
        profile: {
          phone: '09180001111',
          address: 'Barangay San Juan, Quezon City',
          dateOfBirth: dt('2008-04-12T00:00:00Z')
        },
        library: {
          cardNumber: 'LIB-25-0001',
          membershipDate: dt('2025-06-05T00:00:00Z'),
          borrowingLimit: 5,
          fineBalance: 0
        },
        createdAt: dt('2025-06-05T00:00:00Z'),
        updatedAt: dt('2025-09-15T02:30:00Z'),
        lastLoginAt: dt('2025-09-18T01:10:00Z'),
        lastActivityAt: dt('2025-09-18T01:10:00Z')
      },
      {
        _id: benId,
        id: benIdStr,
        username: 'ben.santos',
        email: 'ben.santos@student.olms.edu',
        password: benPassword,
        firstName: 'Ben',
        middleName: 'Luis',
        lastName: 'Santos',
        role: 'student',
        isActive: true,
        libraryCardNumber: 'LIB-25-0002',
        studentId: '2025-1002',
        lrn: '123456789202',
        grade: 'Grade 11',
  section: 'ICT-A',
  curriculum: 'Senior High - ICT',
        barangay: 'Barangay Malinis',
        municipality: 'Quezon City',
        province: 'Metro Manila',
        fullAddress: '45 Mabait St, Barangay Malinis, Quezon City',
        parentGuardianName: 'Roberto Santos',
        parentOccupation: 'Accountant',
        parentAddress: '45 Mabait St, Quezon City',
        parentPhone: '09175553311',
        parentEmail: 'roberto.santos@example.com',
        phoneNumber: '09181112222',
        borrowingStats: buildBorrowingStats({ totalBorrowed: 2, currentlyBorrowed: 1, totalReturned: 1 }),
        profile: {
          phone: '09181112222',
          address: 'Barangay Malinis, Quezon City',
          dateOfBirth: dt('2008-08-03T00:00:00Z')
        },
        library: {
          cardNumber: 'LIB-25-0002',
          membershipDate: dt('2025-06-05T00:00:00Z'),
          borrowingLimit: 5,
          fineBalance: 0
        },
        createdAt: dt('2025-06-05T00:00:00Z'),
        updatedAt: dt('2025-09-20T03:05:00Z'),
        lastLoginAt: dt('2025-09-20T03:00:00Z'),
        lastActivityAt: dt('2025-09-20T03:05:00Z')
      },
      {
        _id: carlaId,
        id: carlaIdStr,
        username: 'carla.navarro',
        email: 'carla.navarro@student.olms.edu',
        password: carlaPassword,
        firstName: 'Carla',
        middleName: 'Teves',
        lastName: 'Navarro',
        role: 'student',
        isActive: true,
        libraryCardNumber: 'LIB-25-0003',
        studentId: '2025-1003',
        lrn: '123456789303',
        grade: 'Grade 11',
  section: 'STEM-B',
  curriculum: 'Senior High - STEM',
        barangay: 'Barangay Masigasig',
        municipality: 'Marikina City',
        province: 'Metro Manila',
        fullAddress: '78 Rivera St, Barangay Masigasig, Marikina City',
        parentGuardianName: 'Teresa Navarro',
        parentOccupation: 'Nurse',
        parentAddress: '78 Rivera St, Marikina City',
        parentPhone: '09173456780',
        parentEmail: 'teresa.navarro@example.com',
        phoneNumber: '09182223333',
        borrowingStats: buildBorrowingStats({ totalBorrowed: 0, currentlyBorrowed: 0, totalReturned: 0 }),
        profile: {
          phone: '09182223333',
          address: 'Barangay Masigasig, Marikina City',
          dateOfBirth: dt('2008-12-21T00:00:00Z')
        },
        library: {
          cardNumber: 'LIB-25-0003',
          membershipDate: dt('2025-07-10T00:00:00Z'),
          borrowingLimit: 5,
          fineBalance: 0
        },
        createdAt: dt('2025-07-10T00:00:00Z'),
        updatedAt: dt('2025-09-10T06:00:00Z'),
        lastLoginAt: dt('2025-09-16T07:20:00Z'),
        lastActivityAt: dt('2025-09-16T07:20:00Z')
      }
    ];

    const book1Id = new ObjectId();
    const book2Id = new ObjectId();
    const book3Id = new ObjectId();
    const book4Id = new ObjectId();

    const book1Copies = [
      buildCopy({
        copyId: 'ITE-001',
        status: 'borrowed',
        condition: 'good',
        location: 'ICT Resource Shelf',
        createdAt: '2025-08-01T01:00:00Z',
        updatedAt: '2025-09-15T02:35:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }),
      buildCopy({
        copyId: 'ITE-002',
        status: 'available',
        condition: 'good',
        location: 'ICT Resource Shelf',
        createdAt: '2025-08-01T01:00:00Z',
        updatedAt: '2025-09-10T04:00:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }),
      buildCopy({
        copyId: 'ITE-003',
        status: 'available',
        condition: 'excellent',
        location: 'ICT Resource Shelf',
        createdAt: '2025-08-01T01:00:00Z',
        updatedAt: '2025-09-10T04:00:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      })
    ];

    const book2Copies = [
      buildCopy({
        copyId: 'PHHIS-001',
        status: 'available',
        condition: 'good',
        location: 'History Corner',
        createdAt: '2025-07-15T01:00:00Z',
        updatedAt: '2025-08-28T03:10:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }),
      buildCopy({
        copyId: 'PHHIS-002',
        status: 'available',
        condition: 'good',
        location: 'History Corner',
        createdAt: '2025-07-15T01:00:00Z',
        updatedAt: '2025-08-10T03:10:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }),
      buildCopy({
        copyId: 'PHHIS-003',
        status: 'available',
        condition: 'excellent',
        location: 'History Corner',
        createdAt: '2025-07-15T01:00:00Z',
        updatedAt: '2025-08-10T03:10:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      })
    ];

    const book3Copies = [
      buildCopy({
        copyId: 'MATH-001',
        status: 'available',
        condition: 'good',
        location: 'STEM Reference',
        createdAt: '2025-06-20T01:00:00Z',
        updatedAt: '2025-09-12T07:45:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }),
      buildCopy({
        copyId: 'MATH-002',
        status: 'available',
        condition: 'good',
        location: 'STEM Reference',
        createdAt: '2025-06-20T01:00:00Z',
        updatedAt: '2025-09-14T09:20:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }),
      buildCopy({
        copyId: 'MATH-003',
        status: 'available',
        condition: 'excellent',
        location: 'STEM Reference',
        createdAt: '2025-06-20T01:00:00Z',
        updatedAt: '2025-09-12T07:45:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      })
    ];

    const book4Copies = [
      buildCopy({
        copyId: 'LIT-001',
        status: 'borrowed',
        condition: 'good',
        location: 'Literature Wing',
        createdAt: '2025-07-05T01:00:00Z',
        updatedAt: '2025-09-20T03:05:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }),
      buildCopy({
        copyId: 'LIT-002',
        status: 'available',
        condition: 'excellent',
        location: 'Literature Wing',
        createdAt: '2025-07-05T01:00:00Z',
        updatedAt: '2025-09-10T03:05:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }),
      buildCopy({
        copyId: 'LIT-003',
        status: 'available',
        condition: 'good',
        location: 'Literature Wing',
        createdAt: '2025-07-05T01:00:00Z',
        updatedAt: '2025-09-10T03:05:00Z',
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      })
    ];

    const buildBook = ({ _id, title, author, isbn, publisher, publishedYear, category, description, copies, createdAt, updatedAt }) => ({
      _id,
      id: `book_${_id.toString()}`,
      title,
      author,
      isbn,
      publisher,
      publishedYear,
      category,
      description,
      coverImage: '',
      status: 'active',
      totalCopies: copies.length,
      availableCopies: copies.filter((copy) => copy.status === 'available').length,
      copies,
      createdAt: dt(createdAt),
      updatedAt: dt(updatedAt),
      createdBy: librarianIdStr,
      updatedBy: librarianIdStr
    });

    const books = [
      buildBook({
        _id: book1Id,
        title: 'Information Technology Essentials',
        author: 'Ramon Valdez',
        isbn: '978-971-000-1001',
        publisher: 'MindShare Publishing',
        publishedYear: 2023,
        category: 'Information Technology',
        description: 'Comprehensive introduction to ICT concepts, networking, and emerging technologies.',
        copies: book1Copies,
        createdAt: '2025-08-01T01:00:00Z',
        updatedAt: '2025-09-15T02:35:00Z'
      }),
      buildBook({
        _id: book2Id,
        title: 'Philippine History and Governance',
        author: 'Luzviminda Mercado',
        isbn: '978-971-000-2002',
        publisher: 'Heritage Prints',
        publishedYear: 2022,
        category: 'Social Studies',
        description: 'Chronological account of Philippine history with focus on civic responsibility.',
        copies: book2Copies,
        createdAt: '2025-07-15T01:00:00Z',
        updatedAt: '2025-08-28T03:10:00Z'
      }),
      buildBook({
        _id: book3Id,
        title: 'Advanced Mathematics for Senior High',
        author: 'Cristina Villoria',
        isbn: '978-971-000-3003',
        publisher: 'STEM Excellence Press',
        publishedYear: 2024,
        category: 'Mathematics',
        description: 'Problem-based approach to calculus, statistics, and trigonometry for senior high students.',
        copies: book3Copies,
        createdAt: '2025-06-20T01:00:00Z',
        updatedAt: '2025-09-14T09:20:00Z'
      }),
      buildBook({
        _id: book4Id,
        title: '21st Century Philippine Literature',
        author: 'Amelia Magbanua',
        isbn: '978-971-000-4004',
        publisher: 'Literary Gateway',
        publishedYear: 2024,
        category: 'Literature',
        description: 'Anthology of modern Philippine literary works with contextual analysis.',
        copies: book4Copies,
        createdAt: '2025-07-05T01:00:00Z',
        updatedAt: '2025-09-20T03:05:00Z'
      })
    ];

    const buildTransaction = ({
      _id,
      userId,
      items,
      status,
      borrowDate,
      dueDate,
      returnDate,
      fineAmount,
      notes,
      renewalCount,
      createdAt,
      updatedAt,
      createdBy,
      returnNotes,
          returnedBy,
          type = 'regular'
        }) => {
          const kind = type === 'annual-set' ? 'annual' : 'borrow';
          return {
            _id,
            id: generateTransactionId(kind),
            userId,
            items,
            type,
            status,
            borrowDate: borrowDate ? dt(borrowDate) : null,
            dueDate: dueDate ? dt(dueDate) : null,
            returnDate: returnDate ? dt(returnDate) : null,
            fineAmount,
            notes,
            renewalCount,
            createdAt: dt(createdAt),
            updatedAt: dt(updatedAt),
            createdBy,
            ...(returnNotes ? { returnNotes } : {}),
            ...(returnedBy ? { returnedBy } : {})
          };
        };

    const transaction1Id = new ObjectId();
    const transaction2Id = new ObjectId();
    const transaction3Id = new ObjectId();
    const transaction4Id = new ObjectId();

    const transaction1 = buildTransaction({
        _id: transaction1Id,
        userId: alyssaIdStr,
        items: [
          {
            copyId: 'ITE-001',
            bookId: `book_${book1Id.toString()}`,
            isbn: '978-971-000-1001',
            status: 'borrowed'
          }
        ],
        status: 'borrowed',
        borrowDate: '2025-09-15T02:30:00Z',
        dueDate: '2025-09-29T02:30:00Z',
        returnDate: null,
        fineAmount: 0,
        notes: 'Borrowed for ICT research project',
        renewalCount: 0,
        createdAt: '2025-09-15T02:30:00Z',
        updatedAt: '2025-09-15T02:35:00Z',
        createdBy: librarianIdStr
      });

    const transaction2 = buildTransaction({
        _id: transaction2Id,
        userId: benIdStr,
        items: [
          {
            copyId: 'PHHIS-001',
            bookId: `book_${book2Id.toString()}`,
            isbn: '978-971-000-2002',
            status: 'returned',
            returnedAt: dt('2025-08-28T03:10:00Z')
          }
        ],
        status: 'returned',
        borrowDate: '2025-08-20T03:00:00Z',
        dueDate: '2025-09-03T03:00:00Z',
        returnDate: '2025-08-28T03:10:00Z',
        fineAmount: 0,
        notes: 'Completed history assignment early',
        renewalCount: 0,
        createdAt: '2025-08-20T03:00:00Z',
        updatedAt: '2025-08-28T03:10:00Z',
        createdBy: librarianIdStr,
        returnNotes: 'Returned in good condition',
        returnedBy: librarianIdStr
      });

    const transaction3 = buildTransaction({
        _id: transaction3Id,
        userId: benIdStr,
        items: [
          {
            copyId: 'LIT-001',
            bookId: `book_${book4Id.toString()}`,
            isbn: '978-971-000-4004',
            status: 'borrowed'
          }
        ],
        status: 'borrowed',
        borrowDate: '2025-09-20T03:00:00Z',
        dueDate: '2025-10-04T03:00:00Z',
        returnDate: null,
        fineAmount: 0,
        notes: 'Reading requirement for 21st Century Literature',
        renewalCount: 0,
        createdAt: '2025-09-20T03:00:00Z',
        updatedAt: '2025-09-20T03:05:00Z',
        createdBy: librarianIdStr
      });

    const transaction4 = buildTransaction({
        _id: transaction4Id,
        userId: staffIdStr,
        items: [
          {
            copyId: 'MATH-002',
            bookId: `book_${book3Id.toString()}`,
            isbn: '978-971-000-3003',
            status: 'returned',
            returnedAt: dt('2025-09-14T09:20:00Z')
          }
        ],
        status: 'returned',
        borrowDate: '2025-08-30T09:00:00Z',
        dueDate: '2025-09-10T09:00:00Z',
        returnDate: '2025-09-14T09:20:00Z',
        fineAmount: 60,
        notes: 'Reference for remedial math program',
        renewalCount: 0,
        createdAt: '2025-08-30T09:00:00Z',
        updatedAt: '2025-09-14T09:20:00Z',
        createdBy: librarianIdStr,
        returnNotes: 'Returned with minimal notes on pages',
        returnedBy: librarianIdStr
      });

    const transactions = [transaction1, transaction2, transaction3, transaction4];

    const settings = [
      {
        _id: new ObjectId(),
        id: 'MAX_BORROW_DAYS',
        value: 14,
        type: 'number',
        category: 'library',
        description: 'Maximum number of days for regular book borrowing',
        createdAt: dt('2025-07-01T00:00:00Z'),
        updatedAt: dt('2025-09-01T00:00:00Z')
      },
      {
        _id: new ObjectId(),
        id: 'FINE_PER_DAY',
        value: 15,
        type: 'number',
        category: 'library',
        description: 'Fine amount per day for overdue books',
        createdAt: dt('2025-07-01T00:00:00Z'),
        updatedAt: dt('2025-09-01T00:00:00Z')
      },
      {
        _id: new ObjectId(),
        id: 'SCHOOL_YEAR_START',
        value: '2025-08-01',
        type: 'string',
        category: 'library',
        description: 'School year start date',
        createdAt: dt('2025-07-01T00:00:00Z'),
        updatedAt: dt('2025-07-01T00:00:00Z')
      },
      {
        _id: new ObjectId(),
        id: 'SCHOOL_YEAR_END',
        value: '2026-05-31',
        type: 'string',
        category: 'library',
        description: 'School year end date',
        createdAt: dt('2025-07-01T00:00:00Z'),
        updatedAt: dt('2025-07-01T00:00:00Z')
      },
      {
        _id: new ObjectId(),
        id: 'LIBRARY_NAME',
        value: 'ONHS Integrated Learning Resource Center',
        type: 'string',
        category: 'library',
        description: 'Library name for receipts',
        createdAt: dt('2025-07-01T00:00:00Z'),
        updatedAt: dt('2025-09-01T00:00:00Z')
      },
      {
        _id: new ObjectId(),
        id: 'LIBRARY_ADDRESS',
        value: 'Innovation Building, Quezon City Campus',
        type: 'string',
        category: 'library',
        description: 'Library address for receipts',
        createdAt: dt('2025-07-01T00:00:00Z'),
        updatedAt: dt('2025-09-01T00:00:00Z')
      },
      {
        _id: new ObjectId(),
        id: 'ENABLE_FINES',
        value: true,
        type: 'boolean',
        category: 'library',
        description: 'Enable or disable fine system',
        createdAt: dt('2025-07-01T00:00:00Z'),
        updatedAt: dt('2025-09-01T00:00:00Z')
      },
      {
        _id: new ObjectId(),
        id: 'MAX_BOOKS_PER_TRANSACTION',
        value: 5,
        type: 'number',
        category: 'library',
        description: 'Maximum number of books per transaction',
        createdAt: dt('2025-07-01T00:00:00Z'),
        updatedAt: dt('2025-09-01T00:00:00Z')
      }
    ];

    const annualSetId = new ObjectId();
    const annualSets = [
      {
        _id: annualSetId,
        id: `annual_${annualSetId.toString()}`,
        name: 'ICT Strand Starter Pack',
        gradeLevel: 'Grade 11',
  section: 'ICT-A',
  curriculum: 'Senior High - ICT',
        academicYear: '2025-2026',
        description: 'Default resource set for incoming ICT students',
        books: [
          {
            bookId: `book_${book1Id.toString()}`,
            quantity: 1,
            copyIds: [],
            required: true,
            notes: 'Core ICT reference'
          },
          {
            bookId: `book_${book2Id.toString()}`,
            quantity: 1,
            copyIds: [],
            required: true,
            notes: 'Philippine History requirement'
          },
          {
            bookId: `book_${book4Id.toString()}`,
            quantity: 1,
            copyIds: [],
            required: false,
            notes: 'Recommended reading for literature subjects'
          }
        ],
        createdAt: dt('2025-09-01T01:00:00Z'),
        updatedAt: dt('2025-09-01T01:00:00Z'),
        createdBy: librarianIdStr,
        updatedBy: librarianIdStr
      }
    ];

    const buildAuditEntry = ({
      _id,
      timestamp,
      action,
      entity,
      entityId,
      resource,
      resourceId,
      description,
      details,
      metadata,
      status,
      statusCode,
      success,
      user
    }) => ({
      _id,
      id: _id.toString(),
      timestamp: dt(timestamp),
      createdAt: dt(timestamp),
      updatedAt: dt(timestamp),
      action,
      entity,
      entityId,
      resource,
      resourceId,
      description,
      details,
      metadata,
      status,
      statusCode,
      success,
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      userName: `${user.firstName} ${user.lastName}`,
      username: user.username,
      ipAddress: '::ffff:127.0.0.1',
      userAgent: 'Seed Script / MongoDB Loader',
      requestMethod: metadata?.requestMethod || 'POST',
      requestPath: metadata?.requestPath || '/seed'
    });

    const auditEntries = [
      buildAuditEntry({
        _id: new ObjectId(),
        timestamp: '2025-09-20T01:15:00Z',
        action: 'LOGIN',
        entity: 'auth',
        entityId: adminIdStr,
        resource: 'auth',
        resourceId: adminIdStr,
        description: 'Login successful for admin',
        details: {
          username: 'admin',
          role: 'admin'
        },
        metadata: {
          statusCode: 200,
          requestMethod: 'POST',
          requestPath: '/api/auth/login'
        },
        status: 'Success',
        statusCode: 200,
        success: true,
        user: users[0]
      }),
      buildAuditEntry({
        _id: new ObjectId(),
        timestamp: '2025-09-15T02:35:15Z',
        action: 'BORROW',
        entity: 'transaction',
        entityId: transaction1.id,
        resource: 'transaction',
        resourceId: transaction1.id,
        description: 'Borrowed 1 item for Alyssa Gomez',
        details: {
          transactionId: transaction1.id,
          borrower: {
            id: alyssaIdStr,
            name: 'Alyssa Gomez',
            libraryCardNumber: 'LIB-25-0001'
          },
          items: ['ITE-001']
        },
        metadata: {
          statusCode: 201,
          actorId: librarianIdStr,
          requestMethod: 'POST',
          requestPath: '/api/transactions/borrow'
        },
        status: 'Completed',
        statusCode: 201,
        success: true,
        user: users[1]
      }),
      buildAuditEntry({
        _id: new ObjectId(),
        timestamp: '2025-08-28T03:10:30Z',
        action: 'RETURN',
        entity: 'transaction',
        entityId: transaction2.id,
        resource: 'transaction',
        resourceId: transaction2.id,
        description: 'Returned 1 item for Ben Santos',
        details: {
          transactionId: transaction2.id,
          borrower: {
            id: benIdStr,
            name: 'Ben Santos'
          },
          items: ['PHHIS-001'],
          fineAmount: 0
        },
        metadata: {
          statusCode: 200,
          actorId: librarianIdStr,
          requestMethod: 'POST',
          requestPath: `/api/transactions/${transaction2.id}/return`
        },
        status: 'Completed',
        statusCode: 200,
        success: true,
        user: users[1]
      }),
      buildAuditEntry({
        _id: new ObjectId(),
        timestamp: '2025-09-14T09:21:00Z',
        action: 'RETURN',
        entity: 'transaction',
        entityId: transaction4.id,
        resource: 'transaction',
        resourceId: transaction4.id,
        description: 'Return completed with overdue fine for Michael Reyes',
        details: {
          transactionId: transaction4.id,
          borrower: {
            id: staffIdStr,
            name: 'Michael Reyes'
          },
          items: ['MATH-002'],
          fineAmount: 60,
          daysOverdue: 4
        },
        metadata: {
          statusCode: 200,
          actorId: librarianIdStr,
          requestMethod: 'POST',
          requestPath: `/api/transactions/${transaction4.id}/return`
        },
        status: 'Completed',
        statusCode: 200,
        success: true,
        user: users[1]
      })
    ];

    console.log('📝 Inserting users...');
    await db.collection('users').insertMany(users);

    console.log('📚 Inserting books...');
    await db.collection('books').insertMany(books);

    console.log('🔄 Inserting transactions...');
    await db.collection('transactions').insertMany(transactions);

    console.log('⚙️  Inserting settings...');
    await db.collection('settings').insertMany(settings);

    console.log('🗂️  Inserting annual sets...');
    await db.collection('annualSets').insertMany(annualSets);

    console.log('🛡️  Inserting audit trail...');
    await db.collection('audit').insertMany(auditEntries);

    console.log('✅ Seeding complete! New interconnected dataset is ready.');
    console.log('\n👤 Accounts created:');
    console.log('   • admin / admin123456');
    console.log('   • librarian.jane / librarian123!');
    console.log('   • staff.mike / staff123!');
    console.log('   • alyssa.gomez / alyssa123!');
    console.log('   • ben.santos / ben123!');
    console.log('   • carla.navarro / carla123!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
