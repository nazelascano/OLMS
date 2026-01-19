# Program Listing

_Generated automatically on 2026-01-19 04:20:29Z UTC_

This document follows the program listing format shown in the provided sample.

## .github/

| Field | Details |
| --- | --- |
| Program Name | .github/ |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
.github/
```

## backend/

| Field | Details |
| --- | --- |
| Program Name | backend/ |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
backend/
|-- adapters/
|   |-- DatabaseAdapter.js
|   |-- MongoAdapter.js
|   `-- OfflineMongoAdapter.js
|-- data/
|   |-- annualSets.json
|   |-- audit.json
|   |-- bookCategories.json
|   |-- books.json
|   |-- notificationReads.json
|   |-- notifications.json
|   |-- settings.json
|   |-- transactions.json
|   |-- users.json
|   `-- users.json.bak.1761951782238
|-- middleware/
|   `-- customAuth.js
|-- routes/
|   |-- annualSets.js
|   |-- audit.js
|   |-- books.js
|   |-- curriculum.js
|   |-- customAuth.js
|   |-- departments.js
|   |-- locations.js
|   |-- notifications.js
|   |-- reports.js
|   |-- search.js
|   |-- settings.js
|   |-- students.js
|   |-- transactions.js
|   |-- transactions_fixed.js
|   `-- users.js
|-- scripts/
|   |-- cleanup-email-verification.js
|   |-- init-settings.js
|   |-- migrate-offline-data-to-mongo.js
|   |-- reset-and-seed-mongo.js
|   |-- reset-offline-data.js
|   `-- upload-sample-data.js
|-- test/
|   |-- qr.search.test.js
|   |-- transactions.approve.test.js
|   |-- transactions.filters.test.js
|   |-- transactions.reject.test.js
|   |-- transactions.request.test.js
|   `-- users.test.js
|-- uploads/
|   |-- avatars/
|   |   |-- avatar-1762655472557-1723603.png
|   |   |-- avatar-1765167450651-207326744.jpg
|   |   `-- avatar-1767937221184-355748037.jpg
|   `-- branding/
|       |-- branding-1768358904676-118567570.png
|       `-- branding-1768358915706-248313050.png
|-- utils/
|   |-- auditLogger.js
|   |-- inventoryNotifications.js
|   |-- notificationChannels.js
|   |-- notificationCopy.js
|   |-- notificationUtils.js
|   |-- psgcClient.js
|   |-- settingsCache.js
|   |-- transactionIds.js
|   `-- userAttributes.js
|-- .env
|-- .env.example
|-- app.js
|-- diagnostic.js
|-- fix-all-data.js
|-- fix-json.js
|-- package-lock.json
|-- package.json
|-- recreate-transactions.js
|-- server.js
|-- test-login.ps1
`-- tmp_auth_debug.log
```

## docs/

| Field | Details |
| --- | --- |
| Program Name | docs/ |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
docs/
|-- images/
|   `-- system-overview.svg
|-- COMPOSITION.md
|-- INSTALLATION_GUIDE.md
|-- MODULE_PROGRAMS_TABLE.md
`-- PROGRAM_LISTING.md
```

## empty_dir/

| Field | Details |
| --- | --- |
| Program Name | empty_dir/ |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
empty_dir/
```

## frontend/

| Field | Details |
| --- | --- |
| Program Name | frontend/ |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
frontend/
|-- build/
|   |-- static/
|   |   |-- css/
|   |   |   |-- main.2619585b.css
|   |   |   `-- main.2619585b.css.map
|   |   |-- js/
|   |   |   |-- 239.d0006834.chunk.js
|   |   |   |-- 239.d0006834.chunk.js.LICENSE.txt
|   |   |   |-- 239.d0006834.chunk.js.map
|   |   |   |-- 455.f3419c4b.chunk.js
|   |   |   |-- 455.f3419c4b.chunk.js.map
|   |   |   |-- 977.e6d54c6f.chunk.js
|   |   |   |-- 977.e6d54c6f.chunk.js.LICENSE.txt
|   |   |   |-- 977.e6d54c6f.chunk.js.map
|   |   |   |-- main.d067b7a3.js
|   |   |   |-- main.d067b7a3.js.LICENSE.txt
|   |   |   `-- main.d067b7a3.js.map
|   |   `-- media/
|   |       |-- login_bg.d81d81950491b44828e5.jpg
|   |       `-- logo.6c184e85e47f0d9b0f7e.png
|   |-- asset-manifest.json
|   |-- index.html
|   `-- manifest.json
|-- public/
|   |-- index.html
|   `-- manifest.json
|-- src/
|   |-- assets/
|   |   `-- images/
|   |       |-- login_bg.jpg
|   |       |-- logo.jpg
|   |       `-- logo.png
|   |-- components/
|   |   |-- Auth/
|   |   |   `-- ProtectedRoute.js
|   |   |-- Layout/
|   |   |   |-- Layout.js
|   |   |   |-- MobileNavBar.js
|   |   |   `-- Sidebar.js
|   |   |-- Transactions/
|   |   |   `-- ApproveRequestDialog.js
|   |   |-- Loading.js
|   |   |-- MobileScanButton.js
|   |   |-- MobileScanDialog.js
|   |   |-- QRScanner.js
|   |   `-- SplashScreen.js
|   |-- contexts/
|   |   |-- AuthContext.js
|   |   `-- SettingsContext.js
|   |-- data/
|   |   `-- addressOptions.js
|   |-- pages/
|   |   |-- Auth/
|   |   |   `-- LoginPage.js
|   |   |-- Books/
|   |   |   |-- BookCopies.js
|   |   |   |-- BookDetails.js
|   |   |   |-- BookForm.js
|   |   |   |-- BookImportDialog.js
|   |   |   `-- BooksList.js
|   |   |-- Dashboard/
|   |   |   |-- AdminDashboard.js
|   |   |   |-- LibrarianDashboard.js
|   |   |   |-- StaffDashboard.js
|   |   |   `-- StudentDashboard.js
|   |   |-- Error/
|   |   |   |-- NotFoundPage.js
|   |   |   `-- UnauthorizedPage.js
|   |   |-- Notifications/
|   |   |   `-- NotificationsPage.js
|   |   |-- Reports/
|   |   |   |-- AuditLogs.js
|   |   |   `-- ReportsPage.js
|   |   |-- Search/
|   |   |   `-- SearchResults.js
|   |   |-- Settings/
|   |   |   `-- SettingsPage.js
|   |   |-- Students/
|   |   |   |-- StudentForm.js
|   |   |   |-- StudentImportDialog.js
|   |   |   `-- StudentsList.js
|   |   |-- Transactions/
|   |   |   |-- AnnualBorrowing.js
|   |   |   |-- BorrowForm.js
|   |   |   |-- RequestsPage.js
|   |   |   |-- ReturnForm.js
|   |   |   |-- TransactionDetails.js
|   |   |   `-- TransactionsList.js
|   |   `-- Users/
|   |       |-- UserForm.js
|   |       |-- UserProfile.js
|   |       `-- UsersList.js
|   |-- theme/
|   |   |-- actionButtons.js
|   |   `-- customTheme.js
|   |-- utils/
|   |   |-- __tests__/
|   |   |   `-- userAttributes.test.js
|   |   |-- addressService.js
|   |   |-- api.js
|   |   |-- authorDisplay.js
|   |   |-- currency.js
|   |   |-- media.js
|   |   |-- pdfGenerator.js
|   |   |-- scanEvents.js
|   |   `-- userAttributes.js
|   |-- App.js
|   |-- index.css
|   `-- index.js
|-- .env
|-- craco.config.js
|-- orig_StudentImportDialog.js
|-- package-lock.json
`-- package.json
```

## scripts/

| Field | Details |
| --- | --- |
| Program Name | scripts/ |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
scripts/
`-- keep-alive.js
```

## .env.development

| Field | Details |
| --- | --- |
| Program Name | .env.development |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
.env.development
```

## .gitignore

| Field | Details |
| --- | --- |
| Program Name | .gitignore |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
.gitignore
```

## debug-routes.js

| Field | Details |
| --- | --- |
| Program Name | debug-routes.js |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
debug-routes.js
```

## FILE_STATUS_REPORT.txt

| Field | Details |
| --- | --- |
| Program Name | FILE_STATUS_REPORT.txt |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
FILE_STATUS_REPORT.txt
```

## package-lock.json

| Field | Details |
| --- | --- |
| Program Name | package-lock.json |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
package-lock.json
```

## package.json

| Field | Details |
| --- | --- |
| Program Name | package.json |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
package.json
```

## README.md

| Field | Details |
| --- | --- |
| Program Name | README.md |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
README.md
```

## render.yaml

| Field | Details |
| --- | --- |
| Program Name | render.yaml |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
render.yaml
```

## Screenshot_2026-01-19-12-05-43-07_e5d3893ac03954c6bb675ef2555b879b.jpg

| Field | Details |
| --- | --- |
| Program Name | Screenshot_2026-01-19-12-05-43-07_e5d3893ac03954c6bb675ef2555b879b.jpg |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
Screenshot_2026-01-19-12-05-43-07_e5d3893ac03954c6bb675ef2555b879b.jpg
```

## START_OLMS.bat

| Field | Details |
| --- | --- |
| Program Name | START_OLMS.bat |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
START_OLMS.bat
```

## tmp_replace.py

| Field | Details |
| --- | --- |
| Program Name | tmp_replace.py |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
tmp_replace.py
```

## vercel.json

| Field | Details |
| --- | --- |
| Program Name | vercel.json |
| Description | N/A |
| Called by | N/A |
| Table used | N/A |
| Programmer | N/A |
| Date created | N/A |
| Revision Date | N/A |
| Revision / description of change | None |

```
vercel.json
```
