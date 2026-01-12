# OLMS Installation Guide

This guide walks through a clean installation of the Online Library Management System (OLMS) on a development workstation and prepares you for production deployments. For a feature tour and architecture overview see [README.md](README.md).

## 1. System Requirements

| Requirement | Recommended Version | Notes |
| --- | --- | --- |
| Operating System | Windows 10/11, macOS 13+, Ubuntu 22.04+ | Other POSIX systems work as long as Node.js is available. |
| Node.js | v18 LTS (minimum v16) | Verify with `node -v`. |
| npm | v9+ (ships with Node 18) | Verify with `npm -v`. |
| Git | v2.30+ | Needed for cloning and updates. |
| MongoDB | v6.x Community or Atlas Cluster | Skip if you plan to use the offline JSON adapter. |
| PowerShell 5.1+ or Bash | — | Required for helper scripts such as [START_OLMS.bat](START_OLMS.bat). |

## 2. Clone the Repository

```bash
git clone <repository-url>
cd "ONHS OLMS - mongodb"
```

> If you received the codebase as a ZIP, extract it and open the workspace folder in VS Code.

## 3. Install Dependencies

### Option A: Install Everything at Once
```bash
npm run install:all
```
This installs root tooling plus the dependencies inside [frontend](frontend) and [backend](backend).

### Option B: Manual Installation
```bash
npm install
cd frontend && npm install
cd ../backend && npm install
```

After installation you should see node_modules folders inside the root, frontend, and backend directories.

## 4. Configure Environment Variables

Create two .env files—one for the API and one for the React app.

### 4.1 Backend Environment ([backend/.env](backend/.env))
```env
NODE_ENV=development
PORT=5001
FRONTEND_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
MONGODB_URI=mongodb://localhost:27017/olms
MONGO_DB_NAME=olms
USE_OFFLINE_DB=false
JWT_SECRET=replace-with-long-random-string
JWT_EXPIRE=7d
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=app-password
DEFAULT_BORROW_DAYS=14
DEFAULT_FINE_PER_DAY=5
AUTO_CLEANUP_DAYS=365
```
- `MONGODB_URI` is required when `USE_OFFLINE_DB=false` and should point to either your local Mongo instance or Atlas cluster.
- `UPLOAD_PATH` will be created automatically; ensure the hosting environment allows write access.
- Omit the email settings if you do not need outbound messages in development.

### 4.2 Frontend Environment ([frontend/.env](frontend/.env))
```env
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_NAME=OLMS - Online Library Management System
REACT_APP_VERSION=1.0.0
```
Restart both dev servers after changing either env file so that new values are picked up.

## 5. Database & Data Options

### 5.1 Local MongoDB
1. Install MongoDB Community Edition from https://www.mongodb.com/try/download/community.
2. Start `mongod` (default port 27017).
3. Ensure `MONGODB_URI=mongodb://localhost:27017/olms` in [backend/.env](backend/.env).

### 5.2 MongoDB Atlas
1. Create a free cluster at https://www.mongodb.com/atlas.
2. Create a database user and note the password.
3. Allow your IP (0.0.0.0/0 for dev only).
4. Update `MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/olms?retryWrites=true&w=majority`.
5. Keep credentials out of version control.

### 5.3 Offline JSON Adapter
- Set `USE_OFFLINE_DB=true` in [backend/.env](backend/.env) or run any script with `cross-env USE_OFFLINE_DB=true`.
- Data persists in JSON files under [backend/data](backend/data).
- This mode is ideal for demos when MongoDB is unavailable.

## 6. Seed Sample Data

### 6.1 MongoDB Seed Script
1. Confirm `MONGODB_URI` and `MONGO_DB_NAME` are valid.
2. Run:
   ```bash
   cd backend
   node scripts/reset-and-seed-mongo.js
   ```
3. The script in [backend/scripts/reset-and-seed-mongo.js](backend/scripts/reset-and-seed-mongo.js) wipes the key collections and creates:
   - Admin: `admin / admin123456`
   - Librarian: `librarian.jane / librarian123!`
   - Staff: `staff.mike / staff123!`
   - Several students with realistic borrowing histories.
4. Re-run the script any time you want a clean dataset.

### 6.2 Offline Dataset Reset
```bash
cd backend
npm run offline:reset
```
- [backend/scripts/reset-offline-data.js](backend/scripts/reset-offline-data.js) backs up JSON files, recreates defaults, and ensures at least one admin user. Override the generated admin password by exporting `ADMIN_PASSWORD` before running the command.

## 7. Run the Application

### 7.1 Combined Development Stack
```bash
npm run dev
```
- Launches the backend on `http://localhost:5001` and the frontend on `http://localhost:3001`.
- Visit `http://localhost:3001` and log in with the seeded credentials.

### 7.2 Offline Development Shortcut
```bash
npm run dev:offline
```
Equivalent to running `USE_OFFLINE_DB=true npm run dev` and is ideal when MongoDB is unreachable.

### 7.3 Run Services Individually
```bash
npm run server:dev   # Backend only (Express + Mongo/Offline)
npm run client:dev   # Frontend only (React dev server)
```
Windows users can also double-click [START_OLMS.bat](START_OLMS.bat) or run `powershell -ExecutionPolicy Bypass -File START_OLMS.bat` to start both sides.

### 7.4 Health Checks
- Backend: `http://localhost:5001/health`
- Frontend build output: [frontend/build](frontend/build) after running `npm run build`

## 8. Production Build & Deployment

1. Build the React app:
   ```bash
   npm run build
   ```
   This runs `craco build` in [frontend](frontend) and outputs static assets to [frontend/build](frontend/build).
2. Start the API in production mode:
   ```bash
   npm run server:start
   ```
3. For Render + Vercel hosting, reuse the instructions already summarized in [README.md](README.md) under "Deployment". Key environment variables:
   - Backend (Render): `MONGODB_URI`, `MONGO_DB_NAME`, `JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`.
   - Frontend (Vercel): `REACT_APP_API_URL` pointing to the Render deployment.
4. Keep the Render dyno warm by running `npm run keep-alive` (script located at [scripts/keep-alive.js](scripts/keep-alive.js)). Override `KEEP_ALIVE_URL`, `KEEP_ALIVE_INTERVAL_MS`, and `KEEP_ALIVE_TIMEOUT_MS` as needed.

## 9. Testing & Verification

- Frontend unit tests:
  ```bash
  npm test
  ```
  (Runs `craco test` inside [frontend](frontend)).
- Backend API tests (offline fixtures):
  ```bash
  cd backend
  npm test
  ```
  Uses Jest with `USE_OFFLINE_DB=true` so you can run tests without MongoDB.
- Manual smoke test checklist:
  1. Hit `http://localhost:5001/health` and expect `{ status: 'ok' }`.
  2. Log in at `http://localhost:3001` with the admin credentials.
  3. Create a book, borrow it, and return it.
  4. Verify notifications render and audit logs update.

## 10. Troubleshooting

| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| `ECONNREFUSED` when API boots | MongoDB not reachable | Verify `MONGODB_URI`, ensure `mongod` is running, or switch to offline mode. |
| CORS errors in the browser | `FRONTEND_URL`/`CORS_ORIGINS` mismatch | Update variables in [backend/.env](backend/.env) to reflect the actual frontend origin(s). |
| Port already in use | Another app on 3001 or 5001 | Stop the other process or change `PORT` / `PORT=3002` for frontend via `.env` or CLI. |
| Admin password unknown | Seeds not applied | Re-run the seed script or `npm run offline:reset`. |
| Render wakes slowly | Free plan sleep | Run `npm run keep-alive` somewhere that pings the `/health` endpoint. |

## 11. Useful Scripts Summary

| Command | Location | Purpose |
| --- | --- | --- |
| `npm run install:all` | root | Installs root, frontend, and backend packages. |
| `npm run dev` | root | Starts frontend + backend with Mongo (default). |
| `npm run dev:offline` | root | Starts both services against the offline JSON adapter. |
| `npm run server:dev` | root | Runs backend only (hot reload via nodemon). |
| `npm run client:dev` | root | Runs frontend dev server on port 3001. |
| `node scripts/reset-and-seed-mongo.js` | backend | Resets Mongo collections and loads curated data. |
| `npm run offline:reset` | backend | Rebuilds offline JSON datastore with a default admin account. |
| `npm run keep-alive` | root | Keeps hosted backend instances awake by pinging `/health`. |

You are now ready to develop locally, seed realistic datasets, and deploy OLMS to your preferred infrastructure.
