olms-online-library-management/
# OLMS – Online Library Management System

A full-stack library circulation platform for schools and campuses. OLMS combines a React UI, an Express/Mongo API, and an offline JSON adapter so you can demo or deploy anywhere—from a single laptop to Render + Vercel.

## Contents
- [Why OLMS](#why-olms)
- [Architecture Snapshot](#architecture-snapshot)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup in 10 Minutes](#setup-in-10-minutes)
- [Configuration Quick Reference](#configuration-quick-reference)
- [Data Modes (Mongo vs Offline)](#data-modes-mongo-vs-offline)
- [Runbook](#runbook)
- [Default Accounts & Sample Data](#default-accounts--sample-data)
- [Deployment Playbook](#deployment-playbook)
- [Testing & QA](#testing--qa)
- [Troubleshooting Cheatsheet](#troubleshooting-cheatsheet)
- [Documentation & Support](#documentation--support)
- [Contributing](#contributing)
- [License](#license)

## Why OLMS
- **Role-aware workflows** – Admin, librarian, staff, and student experiences, each with scoped permissions.
- **Copy-level tracking** – Every physical book copy carries its own ID, barcode/QR, and status.
- **Multi-book transactions** – Borrow, approve, return, and reject multiple titles in one request.
- **Audit-ready** – Receipts, notifications, and audit logs keep every action traceable.
- **Offline-first option** – Switch to JSON data with one flag when MongoDB is unavailable.

## Architecture Snapshot
```
React (frontend/src)
   │  REST over HTTPS
   ▼
Express API (backend/server.js)
   ├─ MongoAdapter  -> MongoDB/Atlas
   └─ OfflineAdapter -> backend/data/*.json
```
Supporting utilities include QR/receipt generators, email hooks, and a keep-alive pinger for hosted APIs.

## Project Structure
```
ONHS OLMS - mongodb/
├── backend/              # Express API, adapters, routes, scripts
├── frontend/             # React app (CRACO + MUI)
├── docs/                 # Guides (installation, modules, compositions)
├── scripts/              # Keep-alive helper and misc tooling
├── START_OLMS.bat        # Windows launcher for dev mode
├── render.yaml           # Render blueprint for backend deploys
├── vercel.json           # Vercel config for frontend deploys
└── README.md             # You are here
```

## Prerequisites
| Requirement | Minimum | Notes |
| --- | --- | --- |
| OS | Windows 10/11, macOS 13+, Ubuntu 22.04 | Guide examples use Windows. |
| Node.js + npm | Node 18 LTS (npm 9+) | Verify with `node -v` / `npm -v`. |
| Git | v2.30+ | Optional if you received a ZIP. |
| MongoDB | v6+ (local or Atlas) | Skip if you plan to use offline JSON mode. |
| Terminal | PowerShell 5.1+ or Bash | Needed for npm scripts. |

## Setup in 10 Minutes
For illustrated, beginner-friendly instructions, follow [docs/INSTALLATION_GUIDE.md](docs/INSTALLATION_GUIDE.md). The TL;DR version:

1. **Install tooling** – Node.js LTS, Git, VS Code, optional MongoDB.
2. **Get the code** – `git clone <repo>` or extract the ZIP, then open the folder in VS Code.
3. **Install dependencies** – `npm run install:all` from the project root (installs root, frontend, backend packages).
4. **Create environment files** – Copy the templates in [Configuration Quick Reference](#configuration-quick-reference) into `backend/.env` and `frontend/.env`.
5. **Pick a data mode** – Set `USE_OFFLINE_DB=true` for JSON storage or configure `MONGODB_URI` for MongoDB/Atlas.
6. **Seed data (optional)** – Run the seeding script for Mongo or the offline reset command for JSON files.
7. **Start everything** – `npm run dev` (or double-click `START_OLMS.bat` on Windows) and log in at http://localhost:3001.

Set aside about 45 minutes the first time; subsequent setups take <10 minutes.

## Configuration Quick Reference
Create the following files:

### backend/.env
```env
NODE_ENV=development
PORT=5001
FRONTEND_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
MONGODB_URI=mongodb://localhost:27017/olms
MONGO_DB_NAME=olms
USE_OFFLINE_DB=false
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRE=7d
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
EMAIL_SERVICE=gmail
EMAIL_USER=you@example.com
EMAIL_PASS=app-password
DEFAULT_BORROW_DAYS=14
DEFAULT_FINE_PER_DAY=5
AUTO_CLEANUP_DAYS=365
```

### frontend/.env
```env
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_NAME=OLMS - Online Library Management System
REACT_APP_VERSION=1.0.0
```
Restart dev servers whenever you change either file.

## Data Modes (Mongo vs Offline)
| Mode | When to use | How |
| --- | --- | --- |
| **MongoDB (local)** | Day-to-day development with full feature parity. | Install MongoDB Community, keep `USE_OFFLINE_DB=false`, leave `MONGODB_URI` pointed at localhost. |
| **MongoDB Atlas** | Cloud dev/prod. | Create a cluster, allow your IP, paste the SRV URI into `MONGODB_URI`. |
| **Offline JSON** | Demos, hackathons, travel without MongoDB. | Set `USE_OFFLINE_DB=true`; data lives in [backend/data](backend/data). |

Switching modes only requires toggling `USE_OFFLINE_DB` and (optionally) changing `MONGODB_URI`.

## Runbook
| Task | Command | Location |
| --- | --- | --- |
| Install all dependencies | `npm run install:all` | project root |
| Start frontend + backend (Mongo) | `npm run dev` | project root |
| Start frontend + backend (offline) | `npm run dev:offline` | project root |
| Backend only (hot reload) | `npm run server:dev` | project root |
| Frontend only (React dev server) | `npm run client:dev` | project root |
| Seed Mongo sample data | `node scripts/reset-and-seed-mongo.js` | backend |
| Reset offline JSON data | `npm run offline:reset` | backend |
| Build frontend for deployment | `npm run build` | project root |
| Start backend in production mode | `npm run server:start` | project root |
| Keep hosted backend awake | `npm run keep-alive` | project root |

Shortcut: Windows users can launch `START_OLMS.bat` to run `npm run dev` with PowerShell-friendly defaults.

## Default Accounts & Sample Data
- Mongo seed script (Section 7 of the installation guide) creates:
  - Admin `admin / admin123456`
  - Librarian `librarian.jane / librarian123!`
  - Staff `staff.mike / staff123!`
- Offline reset generates at least one admin and prints the password to the console (override via `ADMIN_PASSWORD`).
- Student usernames follow the pattern `firstInitial + lastName` with the LRN as the password unless changed.

Always change the admin password after first login in production environments.

## Deployment Playbook
1. **Backend on Render**
   - Import the repo using [render.yaml](render.yaml).
   - Configure environment variables: `MONGODB_URI`, `MONGO_DB_NAME`, `JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`, plus any email settings.
   - Verify the API with `https://<render-app>/health`.
2. **Frontend on Vercel**
   - Vercel uses [vercel.json](vercel.json) to build inside `frontend/`.
   - Set `REACT_APP_API_URL` to the Render backend URL (include `/api`).
   - After deployment, copy the Vercel domain back into Render’s `FRONTEND_URL` and `CORS_ORIGINS`.
3. **Keep the backend warm**
   - Run `npm run keep-alive` locally, on a lightweight VM, or via GitHub Actions so free Render dynos do not sleep.
   - Override `KEEP_ALIVE_URL`, `KEEP_ALIVE_INTERVAL_MS`, or `KEEP_ALIVE_TIMEOUT_MS` as needed (see [scripts/keep-alive.js](scripts/keep-alive.js)).
4. **Checklist**
   - Seed Atlas data (locally or via a scheduled job) before announcing the environment.
   - Validate login, borrowing workflows, notifications, and audit logs on the hosted URLs.
   - Configure custom domains and HTTPS if required (Render and Vercel handle certificates automatically).

## Testing & QA
| Scope | Command | Notes |
| --- | --- | --- |
| Frontend unit tests | `npm test` (inside frontend) | Runs `craco test` with watch mode by default. |
| Backend API tests | `npm test` (inside backend) | Uses Jest with `USE_OFFLINE_DB=true` so MongoDB is not required. |
| Manual smoke test | — | 1) Hit `http://localhost:5001/health`; 2) Log in at `http://localhost:3001`; 3) Create/borrow/return a book; 4) Check notifications and audit logs. |

## Troubleshooting Cheatsheet
| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| PowerShell says `npm` is not recognized | Node.js not installed or PATH not updated | Reinstall Node LTS, reopen the terminal. |
| `ECONNREFUSED` on API startup | MongoDB unreachable | Ensure the Mongo service is running, verify `MONGODB_URI`, or temporarily set `USE_OFFLINE_DB=true`. |
| Browser CORS errors | Backend does not trust the frontend origin | Update `FRONTEND_URL` and `CORS_ORIGINS` in [backend/.env](backend/.env) with the actual URL (scheme + port). |
| Ports 3001/5001 already in use | Another process is bound to the same port | Stop the other app or change the ports via `.env` / CLI overrides. |
| Forgot admin password | Seeds not applied or password changed | Re-run the seed/reset scripts from [docs/INSTALLATION_GUIDE.md](docs/INSTALLATION_GUIDE.md#7-load-sample-data-optional-but-recommended). |
| Render cold start delays | Free plan sleeps the dyno | Run `npm run keep-alive` somewhere reliable to ping `/health`. |

## Documentation & Support
- **Installation walkthrough**: [docs/INSTALLATION_GUIDE.md](docs/INSTALLATION_GUIDE.md)
- **Composition overview**: [docs/COMPOSITION.md](docs/COMPOSITION.md)
- **Module/program matrix**: [docs/MODULE_PROGRAMS_TABLE.md](docs/MODULE_PROGRAMS_TABLE.md)
- **Issue tracking & Q&A**: open a ticket in this repository or contact your tech lead.

## Contributing
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/my-change`).
3. Commit with a descriptive message.
4. Push and open a pull request. Include screenshots or API samples when relevant.

Please run linting/tests before submitting and keep documentation up to date with user-facing changes.

## License
This project is released under the MIT License. See [LICENSE](LICENSE) for details.