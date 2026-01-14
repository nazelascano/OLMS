# OLMS Installation Guide (Beginner Friendly)

If you can follow a recipe, you can set up OLMS. This guide assumes no prior developer experience and walks you from a blank Windows laptop to a working site you can log into.

For a technical deep dive, see [README.md](README.md). If you get stuck, search this guide for the ⚠️ symbol—those call out the most common mistakes.

---

## 0. What You Will Do
1. Install the free tools OLMS needs (Node.js, Git, VS Code, optional MongoDB).
2. Download the OLMS project files.
3. Let npm download everything else for you.
4. Tell OLMS where to find its database (local JSON files or MongoDB).
5. Start the website and sign in with a sample admin user.

Set aside about 45 minutes for the first run-through.

---

## 1. Before You Start

| Item | Minimum | Tips |
| --- | --- | --- |
| Computer | Windows 10 or 11 | macOS/Linux also work, but this guide uses Windows screenshots/paths. |
| Disk space | 10 GB free | npm caches a lot of files. |
| Internet | Stable broadband | Needed for installing Node.js packages. |
| Account permissions | Local admin | Required to install software. |

Optional but helpful: a GitHub account (for updates) and a MongoDB Atlas account (if you want cloud data).

---

## 2. Install Required Software

Do these in order. Keep the installer defaults unless noted.

### 2.1 Node.js + npm (JavaScript runtime)
1. Visit https://nodejs.org and download the “LTS” installer (currently v18).
2. Double-click the installer, accept the license, and keep the default path.
3. After installation, press `Win + X`, choose “Terminal (PowerShell)”, and run:
   ```powershell
   node -v
   npm -v
   ```
   Seeing versions (for example `v18.19.1` and `9.6.7`) means Node.js and npm installed correctly.

### 2.2 Git (gets the project files)
1. Download from https://git-scm.com/downloads.
2. Install with the defaults (VS Code as the default editor is fine).
3. Verify in PowerShell:
   ```powershell
   git --version
   ```

### 2.3 Visual Studio Code (editor)
1. Download from https://code.visualstudio.com.
2. Install and launch it once so Windows registers the app.

### 2.4 MongoDB (only if you do **not** want offline mode)
You can skip MongoDB entirely by using OLMS’s built-in JSON datastore. If you want the “real” database:
1. Go to https://www.mongodb.com/try/download/community.
2. Choose “msi”, run the installer, and keep “Complete” setup.
3. Leave “Install MongoDB as a Service” checked so MongoDB starts automatically.

⚠️ If you skip MongoDB now, you can always add it later—just remember to flip the `USE_OFFLINE_DB` setting back to `false` when you do.

---

## 3. Download the OLMS Project

Pick the option that matches how you received the code.

### Option A – Git Clone (best for updates)
```powershell
cd ~\Downloads
git clone <repository-url>
cd "ONHS OLMS - mongodb"
```

### Option B – ZIP File
1. Download the ZIP archive from the project source.
2. Right-click the ZIP → “Extract All…” → choose `C:\Users\<you>\Downloads`.
3. Rename the extracted folder to `ONHS OLMS - mongodb` if it has a long auto-generated name.

Open the folder in VS Code (`File → Open Folder...`). You should see subfolders like `frontend`, `backend`, and `docs` in the Explorer pane.

---

## 4. Install Project Dependencies

Dependencies are the reusable building blocks OLMS relies on. The project provides an “install everything” helper.

1. In VS Code, press ``Ctrl+` `` to open the built-in terminal (PowerShell).
2. Make sure the terminal prompt ends with `ONHS OLMS - mongodb`.
3. Run:
   ```powershell
   npm run install:all
   ```

What happens:
- npm installs root tools.
- The script then installs packages inside [frontend](frontend) and [backend](backend).
- Installation is done when the terminal shows `added X packages` and returns to the prompt.

⚠️ If the command fails with `npm: command not found`, revisit Section 2.1. If it fails due to corporate proxies, set the proxy using `npm config set proxy http://proxy:port`.

Prefer manual control? Run `npm install`, `cd frontend && npm install`, and `cd ../backend && npm install` yourself.

---

## 5. Create Environment Files (Settings OLMS Reads at Startup)

You need two `.env` files—one for the backend API and one for the React app.

### 5.1 Backend (.env inside [backend](backend))
1. In VS Code Explorer, right-click the `backend` folder → “New File” → name it `.env`.
2. Paste the template below and customize the bold comments:
   ```env
   NODE_ENV=development
   PORT=5001
   FRONTEND_URL=http://localhost:3001
   CORS_ORIGINS=http://localhost:3000,http://localhost:3001
   MONGODB_URI=mongodb://localhost:27017/olms   # change if using Atlas
   MONGO_DB_NAME=olms
   USE_OFFLINE_DB=false                         # set to true to skip MongoDB
   JWT_SECRET=please-change-me-to-a-long-random-string
   JWT_EXPIRE=7d
   MAX_FILE_SIZE=10485760
   UPLOAD_PATH=./uploads
   EMAIL_SERVICE=gmail
   EMAIL_USER=you@example.com                   # used for email alerts; safe to leave blank in dev
   EMAIL_PASS=app-password                      # app password if you enable email
   DEFAULT_BORROW_DAYS=14
   DEFAULT_FINE_PER_DAY=5
   AUTO_CLEANUP_DAYS=365
   ```

### 5.2 Frontend (.env inside [frontend](frontend))
1. Right-click the `frontend` folder → “New File” → `.env`.
2. Paste:
   ```env
   REACT_APP_API_URL=http://localhost:5001/api
   REACT_APP_NAME=OLMS - Online Library Management System
   REACT_APP_VERSION=1.0.0
   ```

⚠️ Anytime you edit a `.env` file, stop the running dev servers (if any) and start them again so changes take effect.

---

## 6. Choose Your Database Mode

OLMS works with either MongoDB (preferred for production) or lightweight JSON files. Pick one mode per environment.

### Option 1 – Offline JSON Mode (fastest way to try OLMS)
1. In [backend/.env](backend/.env), set `USE_OFFLINE_DB=true`.
2. No MongoDB install is required.
3. Data is stored in [backend/data](backend/data) as JSON files you can inspect.

### Option 2 – Local MongoDB Server
1. Install MongoDB Community Edition (Section 2.4).
2. Ensure the Windows service `MongoDB` is running (search “Services” → Start if needed).
3. Keep `USE_OFFLINE_DB=false` and `MONGODB_URI=mongodb://localhost:27017/olms`.

### Option 3 – MongoDB Atlas (cloud)
1. Create a free cluster at https://www.mongodb.com/atlas.
2. Add a database user (keep the username/password handy).
3. Allow your IP (0.0.0.0/0 is fine for testing but remove it later).
4. Copy the connection string from the Atlas dashboard and paste it into `MONGODB_URI`, for example:
   ```
   mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/olms?retryWrites=true&w=majority
   ```
5. Leave `USE_OFFLINE_DB=false`.

---

## 7. Load Sample Data (Optional but Recommended)

Sample data gives you ready-made accounts to log in with.

### 7.1 If You Are Using MongoDB
```powershell
cd backend
node scripts/reset-and-seed-mongo.js
```
The script ([backend/scripts/reset-and-seed-mongo.js](backend/scripts/reset-and-seed-mongo.js)) clears the main collections and creates:
- Admin: `admin / admin123456`
- Librarian: `librarian.jane / librarian123!`
- Staff: `staff.mike / staff123!`

Run the script again any time you want a clean slate.

### 7.2 If You Are Using Offline JSON Data
```powershell
cd backend
npm run offline:reset
```
This calls [backend/scripts/reset-offline-data.js](backend/scripts/reset-offline-data.js). It backs up your current JSON files, recreates the defaults, and prints the auto-generated admin password. Set `ADMIN_PASSWORD=yourPassword` before the command if you want a custom value.

---

## 8. Start OLMS

### 8.1 Easiest: All-in-One Dev Server
```powershell
npm run dev
```
What you’ll see:
- Backend API → http://localhost:5001
- Frontend (React) → http://localhost:3001
- When ready, the terminal shows both servers running. Leave this window open.

Sign in at `http://localhost:3001` using one of the seed accounts.

### 8.2 Offline Shortcut
```powershell
npm run dev:offline
```
This command automatically sets `USE_OFFLINE_DB=true` and starts both servers.

### 8.3 Start Components Individually
```powershell
npm run server:dev   # backend only
npm run client:dev   # frontend only
```
On Windows you can also double-click [START_OLMS.bat](START_OLMS.bat) or run it from PowerShell (`powershell -ExecutionPolicy Bypass -File START_OLMS.bat`).

### 8.4 Health Checks
- API: http://localhost:5001/health → expect `{ "status": "ok" }`.
- Frontend build: generated in [frontend/build](frontend/build) after `npm run build`.

---

## 9. Build and Host (When You’re Ready for Production)

1. Build the React app (creates optimized static files):
   ```powershell
   npm run build
   ```
2. Start the backend in production mode:
   ```powershell
   npm run server:start
   ```
3. Deploy following the “Deployment” section in [README.md](README.md). Common targets:
   - **Render** for the backend. Set environment variables like `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, and `CORS_ORIGINS`.
   - **Vercel** for the frontend. Set `REACT_APP_API_URL` to point at the Render backend.
4. Keep free Render instances awake by running `npm run keep-alive` (script lives at [scripts/keep-alive.js](scripts/keep-alive.js)). Override `KEEP_ALIVE_URL`, `KEEP_ALIVE_INTERVAL_MS`, and `KEEP_ALIVE_TIMEOUT_MS` as needed.

---

## 10. Troubleshooting Cheatsheet

| Symptom | What It Usually Means | Fix |
| --- | --- | --- |
| PowerShell says `npm` is not recognized | Node.js not installed or PATH missing | Re-run the Node.js LTS installer and restart PowerShell. |
| Browser shows CORS errors | Backend doesn’t trust the frontend URL | Update `FRONTEND_URL` and `CORS_ORIGINS` in [backend/.env](backend/.env) so they match the actual site address (including `http://` and port). |
| `ECONNREFUSED` when API starts | MongoDB isn’t reachable | Ensure MongoDB service is running, the connection string is correct, or temporarily switch to offline mode by setting `USE_OFFLINE_DB=true`. |
| Ports 3001 or 5001 already used | Another app is occupying the port | Close the other app or change the ports (`PORT` in backend `.env`, `PORT=3002 npm run client:dev` for frontend). |
| Forgot the admin password | Seed data not loaded or changed | Re-run the appropriate seed/reset command from Section 7. |
| Render backend sleeps | Free tier spins down | Run `npm run keep-alive` somewhere that pings `/health` every few minutes. |

If an error message is unclear, copy the full text and search the project issues or reach out to your tech lead.

---

## 11. Quick Command Reference

| Task | Command | Where to Run |
| --- | --- | --- |
| Install everything | `npm run install:all` | project root |
| Start dev servers | `npm run dev` | project root |
| Start dev servers (offline) | `npm run dev:offline` | project root |
| Backend only | `npm run server:dev` | project root |
| Frontend only | `npm run client:dev` | project root |
| Seed Mongo data | `node scripts/reset-and-seed-mongo.js` | [backend](backend) |
| Reset offline data | `npm run offline:reset` | [backend](backend) |
| Run backend tests | `npm test` | [backend](backend) |
| Run frontend tests | `npm test` | [frontend](frontend) |
| Build frontend for deployment | `npm run build` | project root |
| Keep hosted backend awake | `npm run keep-alive` | project root |

You now have everything necessary to install, run, and host OLMS—even if this is your first time working with JavaScript projects.
