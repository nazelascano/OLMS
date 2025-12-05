# OLMS - Online Library Management System

A comprehensive library management system built with React.js, Node.js, Express.js, and MongoDB.

## 🚀 Quick Start

### One-Click Startup
Run the entire system with a single command:

**Option 1: Using Node.js**
```bash
npm start
```

**Option 2: Windows Batch File**
```bash
start.bat
```

**Option 3: PowerShell Script**
```powershell
.\start.ps1
```

### 👤 Default Login
- **Username:** `admin`
- **Password:** `admin123456`
- **⚠️ Change password after first login!**

### 🌐 Access URLs
- **Frontend:** http://localhost:3001
- **Backend API:** http://localhost:5001

## 🚀 Features

### Core Features
- **Username-based Login**: Simple username/password authentication
- **Role-based Access Control**: Admin, Librarian, Staff, and Student roles
- **User Management**: Complete CRUD operations with role permissions
- **Book Management**: Add, edit, delete books with copy-level tracking
- **Multi-book Transactions**: Borrow/return multiple books in single transaction
- **Annual Borrowing**: Special handling for textbook borrowing
- **Receipt Generation**: QR code and barcode support for transactions
- **Comprehensive Reporting**: Analytics and audit logging
- **Settings Management**: Configurable library rules and parameters

### Advanced Features
- **Copy-level Tracking**: Each physical book copy has unique ID
- **Barcode/QR Code Support**: For easy book and transaction tracking
- **Fine Management**: Automatic calculation of overdue fines
- **Audit Logging**: Complete system action tracking
- **Responsive Design**: Works on desktop, tablet, and mobile

## 🛠️ Technology Stack

### Frontend
- **React 18** – Component-driven SPA framework
- **Material UI (MUI)** – UI component system and theming
- **React Router** – Client-side routing
- **React Query** – Data fetching and caching
- **React Hook Form** – Form state management
- **Axios** – HTTP client abstraction
- **Recharts & Day.js** – Data visualization and date utilities

### Backend
- **Node.js + Express.js** – REST API foundation
- **MongoDB + Mongoose** – Document database and ODM
- **JSON Web Tokens (JWT)** – Authentication and authorization
- **Multer, pdf-lib, qrcode** – File uploads, receipt generation, QR/barcode support
- **csv-parser, papaparse** – Bulk import utilities

### Tooling
- **Concurrently** – Orchestrated frontend/backed dev servers
- **Nodemon** – Hot reloading for the API
- **React Scripts** – Frontend build tooling

## 📋 Prerequisites

Before running this project, make sure you have:

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **MongoDB** (local or cloud instance)

## 🔧 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd olms-online-library-management
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Environment Configuration

#### Backend Environment (.env)
Create `backend/.env` file with the following variables:
```env
# Server Configuration
NODE_ENV=development
PORT=5001
FRONTEND_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/olms
MONGO_DB_NAME=olms
USE_OFFLINE_DB=false

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-here
JWT_EXPIRE=7d

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Email Configuration (Optional)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# System Configuration
DEFAULT_BORROW_DAYS=14
DEFAULT_FINE_PER_DAY=5
AUTO_CLEANUP_DAYS=365
```

#### Frontend Environment (.env)
Create `frontend/.env` file with the following variables:
```env
# API Configuration
REACT_APP_API_URL=http://localhost:5001/api

# Application Configuration
REACT_APP_NAME=OLMS - Online Library Management System
REACT_APP_VERSION=1.0.0
```

### 4. MongoDB Setup

#### Local MongoDB
```bash
# Install MongoDB locally or use MongoDB Atlas
# Make sure MongoDB is running on localhost:27017
```

#### MongoDB Atlas (Cloud)
1. Create account at [https://www.mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create cluster and get connection string
3. Update MONGODB_URI in backend/.env

## 🚀 Running the Application

### Development Mode
```bash
# From root directory - runs both frontend and backend
npm run dev

# Or run separately:
# Backend only
npm run server:dev

# Frontend only
npm run client:dev
```

### Offline Development

This project includes an offline mode that uses local JSON files (no MongoDB required). The offline adapter stores data under `backend/data` and will seed a default admin user automatically.

Recommended way (cross-platform):

- From the repository root (starts frontend + backend in offline mode):
```
npm run dev:offline
```

- Backend only (offline):
```
cd backend
npm run dev:offline
```

PowerShell alternative (temporarily sets env for the current shell):
```
$env:USE_OFFLINE_DB = 'true'; npm run server:dev
```

Notes:
- Default admin credentials: `admin` / `admin123456`.
- Offline data files are in `backend/data` (users.json, books.json, transactions.json, etc.).
- If you want to switch back to MongoDB mode, set `MONGODB_URI` (or `MONGO_URI`) in `backend/.env` and unset `USE_OFFLINE_DB`.


### Production Mode
```bash
# Build frontend
npm run build

# Start backend
npm run server:start
```

## 🌍 Deployment (Render + Vercel)

### 1. Backend on Render
- Create a new Web Service from this repository and choose the **render.yaml** blueprint.
- Render will detect the `backend` directory, run `npm install`, then `npm start` with Node 18.
- Set the following environment variables in the Render dashboard:
   - `MONGODB_URI` – connection string to your MongoDB Atlas cluster.
   - `MONGO_DB_NAME` – database name (e.g., `olms`).
   - `JWT_SECRET` – long random string for token signing.
   - `EMAIL_USER`/`EMAIL_PASS` or other SMTP credentials if email is needed.
   - `FRONTEND_URL` – Vercel URL (update once the frontend is live).
   - `CORS_ORIGINS` – comma-separated list of allowed origins (include Vercel + any admin domains).
   - Leave `USE_OFFLINE_DB` as `false` so the Mongo adapter is used.
- After the first deploy, visit `/health` on the Render URL to confirm the API is healthy.

### 2. Frontend on Vercel
- Import the repository into Vercel and select the **Create React App** framework.
- Because this is a monorepo, Vercel will use `vercel.json` to:
   - run `npm install` and `npm run build` inside `frontend/`.
   - publish the compiled app from `frontend/build`.
- Define environment variables in the Vercel project:
   - `REACT_APP_API_URL` – the full HTTPS URL of the Render backend (e.g., `https://olms-backend.onrender.com/api`).
- Trigger a deployment; once live, note the Vercel domain and copy it back into Render's `FRONTEND_URL` for accurate CORS.

### 3. Post-Deployment Checklist
- Create at least one admin user or seed the database via `backend/scripts/reset-and-seed-mongo.js` (run locally pointing to Atlas credentials or add a Render job).
- Verify login, dashboard metrics, transactions, and settings through the hosted URLs.
- Configure custom domains on both platforms if desired, and enable HTTPS (Render & Vercel handle certificates automatically).
- Keep environment variables in sync between staging/production.

## 📁 Project Structure

```
olms-online-library-management/
├── backend/                 # Backend API
│   ├── middleware/         # Auth and logging middleware
│   ├── models/            # MongoDB schemas
│   ├── routes/            # API routes
│   ├── uploads/           # File uploads directory
│   ├── server.js          # Express server
│   └── package.json
├── frontend/              # React frontend
│   ├── public/           # Static files
│   ├── src/              # Source code
│   │   ├── components/   # Reusable components
│   │   ├── contexts/     # React contexts
│   │   ├── pages/        # Page components
│   │   ├── utils/        # Utility functions
│   │   ├── App.js        # Main app component
│   │   └── index.js      # Entry point
│   └── package.json
├── .github/              # GitHub configuration
│   └── copilot-instructions.md
├── package.json          # Root package.json
└── README.md            # This file
```

## 🔐 Default Login Credentials

After initial setup, you'll need to create users through the admin interface or database seeding.

### Student Login Format:
- **Username**: First letter of first name + surname (e.g., "jdelacruz")
- **Password**: Student LRN

### Staff/Admin Login:
- **Email**: Registered email address
- **Password**: Set during account creation

## 📊 Features Overview

### User Management
- Create students, staff, librarians, and admins
- Role-based permissions and access control
- Bulk student import via CSV
- Automatic username generation for students
- Account cleanup for inactive users

### Book Management
- Add books with detailed information
- Track individual copies with unique IDs
- Support for barcodes and copy status
- Bulk book import via CSV
- Categories and search functionality

### Transaction Management
- Multi-book borrowing in single transaction
- Copy-level tracking and availability
- Return workflows (full or partial)
- Receipt generation with QR codes
- Annual borrowing for textbooks
- Fine calculation and management

### Reporting & Analytics
- Dashboard with key statistics
- Most borrowed books reports
- Overdue transactions monitoring
- Audit logs for all system actions
- Export capabilities (CSV, PDF)

### Settings & Configuration
- Library rules and parameters
- Receipt customization
- Fine management settings
- School year configuration
- System cleanup settings

## 🔧 Development

### Adding New Features
1. Create backend routes in `backend/routes/`
2. Add corresponding frontend API calls in `frontend/src/utils/api.js`
3. Create React components in appropriate directories
4. Update navigation in `Sidebar.js` and `App.js`

### Database Schema
- **Users**: Student, staff, librarian, admin accounts
- **Books**: Book information and metadata
- **BookCopies**: Individual physical copies
- **Transactions**: Borrowing records with multiple books
- **Settings**: System configuration
- **AuditLogs**: System action tracking

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check MongoDB URI format
   - Verify MongoDB is running
   - Check network connectivity for cloud instances

2. **Port Already in Use**
   - Change PORT in backend/.env
   - Kill existing processes on ports 3000/5000

3. **Build Errors**
   - Clear node_modules and reinstall
   - Check for missing dependencies
   - Verify all import paths

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the troubleshooting guide

## 🎯 Roadmap

- [ ] Mobile app development
- [ ] Advanced reporting features
- [ ] Email notifications
- [ ] Inventory management
- [ ] Book recommendation system
- [ ] Multi-library support