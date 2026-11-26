# Changelog

All notable changes to the Saksham Setu project will be documented in this file.

## [Scheme-Driven Live Bank & Portal Locator] - 2026-11-25
### Added
- Created `data/bank_portals_directory.json` with verified profiles, aliases, toll-free helplines, official URLs, processing times, collateral policies, and required documents for 12 Public Sector Banks, Regional Rural Banks, State Channelising Agencies, NBFC-MFIs, and 6 Official Government Application Portals.
- Added `core/bank_locator.py` and `GET /api/banks/live-search/` (`LiveBankSearchView` in `core/views.py` and `core/urls.py`) resolving live GPS or 6-digit Indian PIN coordinates via `core/geo.py` + Nominatim (with offline fallbacks), querying OpenStreetMap Overpass API for real nearby bank branches, filtering official portals by scheme `available_channels`, and attaching cross-referenced `provided_schemes` and `all_branches` to every institution.
- Overhauled `frontend/src/pages/BranchLocator.jsx` into a scheme-driven live locator with a `"Select a Scheme First"` gate when unlinked, Active Scheme Context Banner, `"Use My Live Location"` GPS button with blue pulse marker, 6-digit PIN search, type/radius/keyword filters, Google Maps `"Get Directions"`, `"View on Map"`, `tel:` phone calling + `"Copy Number"`, and a tabbed `"More Details"` modal showing Overview & Docs, all `provided_schemes`, and `all_branches`.
- Removed `"Find Bank"` from the top navigation bar and footer in `frontend/src/components/Layout.jsx` and added `"Find Partner Banks & Official Portals"` links inside `SchemeDetail.jsx` and `ApplyPath.jsx`.
- Synced new `locator` and `detail` i18n keys across `frontend/src/locales/en.json`, `hi.json`, and all 23 `core/translations/*.json` bundles, updated `openapi.yaml`, and added `LiveBankLocatorTests` in `core/tests.py`.

## [Dual-Mode EMI Calculator Upgrade] - 2026-11-25
### Added
- Rebuilt `frontend/src/pages/Calculator.jsx` into a dual-mode financial calculator supporting **Mode A (General / Custom Market Loan)** with 7 realistic market loan presets (`Mudra`, `MSME`, `Education`, `Home / Affordable Housing`, `Agriculture / KCC / Solar Pump`, `Commercial Vehicle / E-Rickshaw`, `Personal / General Unsecured`) and **Mode B (Locked Government Scheme)** triggered via `/calculator?scheme=<CODE>` or the 66-scheme `"Load Govt Scheme"` selector.
- Added Amazon-style dual controls (fine-step range sliders + live direct numeric input fields with `Months / Years` toggle) for Loan Amount, Interest Rate, Tenure, and Moratorium, with full control locking and `"Unlock & Switch to Custom Market Loan"` reset in Mode B.
- Added high-contrast Hero EMI readout, Principal vs. Interest % ratio, automatic Govt Scheme vs. `11.0%` Bank Market Loan savings callout, two interactive custom SVG charts (Principal vs. Interest Donut Chart and Year-by-Year Stacked Repayment + Remaining Balance Graph with moratorium shading and year inspector), and an expandable Year-by-Year Amortization Schedule table with per-year monthly drilldown.
- Added `"View in Locked EMI Calculator"` quick links to `/calculator?scheme=<code>` on `frontend/src/pages/SchemeDetail.jsx`.
- Synced new `calc` and `detail` locale keys across `frontend/src/locales/en.json`, `hi.json`, and all 23 `core/translations/*.json` bundles.

## [All-India Central + State Portal Upgrade] - 2026-11-25
### Added
- Expanded `data/schemes.json` to 66 verified Central, State, Social-Justice Corporation, and NSFDC schemes with enriched metadata (`level`, `applicable_states`, `agency`, `eligible_categories`, `interest_rate_note`, `subsidy_margin_note`, `overview`, `key_highlights`, `required_documents`, `important_notes`, `available_channels`, `official_portal_url`).
- Extended `LoanScheme` in `core/models.py` (with new migration) and updated `core/management/commands/seed_data.py` to seed from `data/schemes.json`.
- Added `GET /api/schemes/<code/>` (`SchemeDetailView`) returning full scheme metadata and yearly EMI amortization breakdown (`monthly_emi`, `total_interest`, `total_payable`, `yearly_schedule`).
- Added dedicated `/scheme/:code` page (`SchemeDetail.jsx`) with SVG Principal vs. Interest donut chart, Year-by-Year Remaining Balance curve with moratorium shading, scheme-specific documents checklist, important notes, and Apply CTA.
- Upgraded `/results` (`Results.jsx`) with `All Eligible` / `Central Govt` / `[User's State] Govt` filter tabs, `CENTRAL GOVT` & `STATE GOVT` badges, direct `More Details ->` & `Compare` (max 3) card buttons, sticky Compare Bar, full-width 2- or 3-column Split-Window Comparison view, and expandable Not Selected / Rejected Schemes accordion with multi-point `rejection_reasons` + `More Details ->`.
- Updated `ApplyPath.jsx` to support all 9 official channels (`pmsuraj`, `jansamarth`, `sca`, `bank`, `mfi`, `kviconline`, `standupmitra`, `pmvishwakarma`, `state_portal`) filtered strictly by `?scheme=<code>`'s `available_channels`.
- Synced new UI translation keys across `frontend/src/locales/en.json`, `hi.json`, and all 23 `core/translations/*.json` bundles, and added comprehensive tests in `core/tests.py`.

## [Unreleased] - 2026-11-25
### Changed
- Removed pre-seeded sample `Application` records (`SS-2026-10001` to `SS-2026-10004`) from `core/management/commands/seed_data.py` and added `--reset` flag to clear previously seeded sample applications while keeping `LoanScheme` and `Branch` catalog seeding.
- Updated `ApplicationCreateView` in `core/views.py` to generate unique `SS-2026-XXXXX` reference numbers safely inside a database transaction.
- Updated `core/tests.py` to create temporary test `Application` records inside test methods and verify immediate tracking and `seed_data` behavior.
- Cleaned `/track` (`Tracker.jsx`) by removing clickable demo chips and sample auto-load, and computing real loan amount and days since submission.
- Reset `frontend/src/state.jsx` and `Form.jsx` defaults so new users start with blank form fields and explicit dropdown selections.
- Removed the top `DEMO DATA` banner from `Layout.jsx` and added a subtle one-line footer disclaimer in `en.json` and `hi.json`.

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
