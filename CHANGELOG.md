# Changelog

All notable changes to the Saksham Setu project will be documented in this file.

## [Steps 2-5] - 2026-11-21
### Added
- Seeded database (`seed_data`): 9 schemes, 28 partner branches, and 4 sample tracking applications.
- Added comprehensive DRF `APIClient` integration test suite in `core/tests.py` covering all 7 API endpoints plus `SpaFallbackView` (25 total tests passing).
- Compiled frontend production bundle using Vite into `frontend/dist`.
- Ran `collectstatic` for WhiteNoise static asset serving (166 static files collected).

## [Step 1] - 2026-11-21
### Added
- Created `core/migrations/0001_initial.py` with initial schemas for `LoanScheme`, `Branch`, and `Application`.
- Applied all Django system and application database migrations to SQLite (`db.sqlite3`).
- Initialized `CHANGELOG.md` and `openapi.yaml`.
