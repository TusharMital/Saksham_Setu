# Changelog

All notable changes to the Saksham Setu project will be documented in this file.

## [Sarthi Security, DB Grounding & Guard Hardening (P9 & P9b)] - 2026-11-26
### Security & Changed
- Hardened `ChatView.post` and `VerifyCategoryView.post` (`core/views.py`) with dict body type-guarding, added `ipaddress`-validated `client_ip(request)` with `TRUSTED_PROXY_COUNT`, and added non-string `message`/`lang` type-guards in `core/chatbot.py`.
- Added crash-proof HMAC-signed assistant history (`_sig_ok` UTF-8 encoding + `django.core.signing.Signer(salt="sarthi-history")` + `hmac.compare_digest`), returning `reply_sig` and forwarding it from `frontend/src/components/Sarthi.jsx` while safely dropping unsigned, tampered, non-ASCII, or lone-surrogate history turns.
- Hardened `config/settings.py` (`load_dotenv(..., override=False)`, defaults `GROQ_MODEL="llama-3.3-70b-versatile"`, `CHAT_RATE_LIMIT_PER_MINUTE=30`, `GROQ_TIMEOUT_SECONDS=12`, `TRUSTED_PROXY_COUNT=0`), `.env.example`, and non-dict body guards on `RecommendView`, `EmiView`, and `ApplicationCreateView` (`core/views.py`) plus `coords_from_pin` (`core/geo.py`).
- Tuned `core/chatbot.py` `load_scheme_grounding(user_text)` to shortlist up to 12 whole compact scheme records with Hindi/regional synonym expansion, `max_tokens=700`, and automatic `1.2s` retry/fallback on `HTTP 429`/`404`.
- Added `<schemes>` prompt hardening, `_SENT_RE` (`[[UNKNOWN]]`/`[[OFFTOPIC]]`) detection, `_END_RE` sentence-boundary trimming on `finish_reason == "length"` (preserving decimals like `4.0%`), URL stripping, `> 10` Indic/ASCII number verification, `_script_ok` Unicode script check (`core/languages.py`), localized guard/disclaimer bundles across all 23 languages, fail-safe atomic `_rate_limited(ip)`, and `HTTP 503` mapping + warning/error logging on upstream errors without disclosing vendor/key or `model`.

## [Full 23-Language i18n Extraction, Automated Groq Translator & RTL/Voice Polish] - 2026-11-26
### Added
- Created `core/management/commands/translate_all_content.py` (`python manage.py translate_all_content`) reading `GROQ_API_KEY` from `.env` with two resumable passes (`--pass ui` and `--pass schemes`), per-model HTTP 429 rate-limit rotation/cooldown, `validate_bundle` / `sanitize_bundle_with_fallback` validation, incremental saving into `data/scheme_translations_cache.json`, and automatic `hi.json` sync to `frontend/src/locales/hi.json`.
- Extracted remaining hardcoded English UI labels, placeholders, aria-labels, tooltips, SVG chart labels, Sarthi 3-question advisor strings, and speech guidance messages across `Layout.jsx`, `Landing.jsx`, `AllSchemes.jsx`, `Form.jsx`, `HelpField.jsx`, `Results.jsx`, `SchemeDetail.jsx`, `Calculator.jsx`, `ApplyPath.jsx`, `BranchLocator.jsx`, `SchemeCompareBarAndModal.jsx`, `Sarthi.jsx`, `schemeHelpers.js`, and `speech.js`, syncing all 907 keys into `core/translations/en.json` and `frontend/src/locales/en.json`.
- Wired `useTranslatedSchemes` inside `InstitutionDetailsModal` in `BranchLocator.jsx` so cross-referenced `provided_schemes` render in the active language alongside `AllSchemes.jsx`, `Results.jsx`, `SchemeDetail.jsx`, `Calculator.jsx`, and `ApplyPath.jsx`.
- Localized remaining backend strings in `core/recommender.py` (`rejectedPrefix`, `acceptedSummary`), `core/category_verifier.py` (`interstateMigrationNote`, `altAgency*`), `core/geo.py` / `core/bank_locator.py` (default institution labels/fallbacks), and `core/chatbot.py` (23-language localized error messages), and enhanced RTL rules in `frontend/src/index.css`.
- Added tests in `core/tests.py` covering interstate Hindi category verification, non-Hindi chatbot error localization, and `GroqPool` HTTP 429 retry/placeholder handling; updated `openapi.yaml`.
- Executed `translate_all_content` via Groq (`hi`, `ur`, `ne`, `ta`, `bn` UI bundles 100% translated with 0 fallbacks, plus 66/66 Hindi schemes cached; remaining languages throttled by Groq free-tier `1,000 OTPM` / `200,000 TPD` organization quotas).

## [All Schemes Catalog Browser (/schemes)] - 2026-11-26
### Added
- Created `frontend/src/pages/AllSchemes.jsx` (`/schemes` route in `frontend/src/App.jsx`) providing a comprehensive 66-scheme catalog browser with live search, 8 portal sort options (`Default`, `Name A–Z / Z–A`, `Interest Rate High/Low`, `Max Loan High/Low`, `Repayment Tenure Longest`), live result counter, removable active filter chips, and `Reset All Filters`.
- Added rich multi-faceted filters in `AllSchemes.jsx` (Government Level, State/UT + exclusive-to-state toggle, multi-select Target Category/Group + `Women Only`, Sector/Loan Purpose, Application Channel) and Amazon-style paired slider + numeric input custom range controls (Desired Loan Amount, Max Interest Rate, Annual Family Income).
- Extracted `frontend/src/components/SchemeCompareBarAndModal.jsx` and `frontend/src/utils/schemeHelpers.js` so `AllSchemes.jsx` and `Results.jsx` share identical `More Details` (`/scheme/<code>`), sticky Compare Bar (up to 3 schemes), and Split-Window Side-by-Side Comparison UX.
- Added `"All Schemes"` (`/schemes`) to the top navigation bar (next to `Home` and `Find Scheme`) and footer links in `frontend/src/components/Layout.jsx`.
- Added `subsidy_note` alias on `LoanSchemeSerializer` (`core/serializers.py`) and optional server-side filtering/sorting support on `GET /api/schemes/` (`core/views.py`), plus `AllSchemesCatalogTests` in `core/tests.py` and updated `openapi.yaml`.
- Added `nav.allSchemes` and `allSchemes.*` i18n keys across `frontend/src/locales/en.json`, `hi.json`, and all 23 `core/translations/*.json` bundles.

## [Removed Standalone Track Page & Links] - 2026-11-26
### Removed
- Deleted `frontend/src/pages/Tracker.jsx` and removed the `/track` route from `frontend/src/App.jsx`.
- Removed `"Track"` from the top navigation bar and footer links in `frontend/src/components/Layout.jsx`, leaving `Home`, `Find Scheme`, and `EMI Calculator`.
- Removed `"Save Application & Get Tracking ID"` / `/track` links from `frontend/src/pages/ApplyPath.jsx`, keeping official portal links, `"Find Partner Banks & Official Portals for This Scheme"` (`/locator?scheme=<code>`), `"View in Locked EMI Calculator"` (`/calculator?scheme=<code>`), and `"Required Documents Checklist"` (`/scheme/<code>`).
- Updated `core/chatbot.py` system prompt so Sarthi AI directs users to official portals/branches for live status and never references `/track` or `/documents`.
- Cleaned up `nav.track`, `landing.trackCta`, `paths.saveAndTrack`, `paths.needProfileForTrack`, and `track.*` keys across `frontend/src/locales/en.json`, `hi.json`, and all 23 `core/translations/*.json` bundles.

## [Removed Redundant Standalone Documents Page] - 2026-11-26
### Removed
- Deleted `frontend/src/pages/Documents.jsx` and removed `/documents` from `Layout.jsx` navbar and footer links (leaving `Home`, `Find Scheme`, `EMI Calculator`, and `Track`).
- Updated `frontend/src/App.jsx` to remove the `Documents` import and redirect `/documents` to `/results`.
- Repointed document checklist buttons on `frontend/src/pages/ApplyPath.jsx` to `/scheme/<code>` (since scheme-specific document checklists live on `/scheme/:code` and `/locator`).
- Cleaned up `nav.documents` and `docs.*` locale keys across `frontend/src/locales/en.json`, `hi.json`, and all 23 `core/translations/*.json` bundles.

## [Scheme-Driven Application Paths Navigation] - 2026-11-26
### Changed
- Removed `"Application Paths"` (`/apply`) from the top navigation bar and footer in `frontend/src/components/Layout.jsx`, keeping `Home`, `Find Scheme`, `EMI Calculator`, `Documents`, and `Track`.
- Made `frontend/src/pages/ApplyPath.jsx` strictly scheme-driven: displays a `"Select a Scheme First"` card with a searchable/grouped 66-scheme dropdown and `"Find Your Eligible Scheme First"` CTA when no scheme is active; when a scheme is selected, renders an Active Scheme Context Banner, only that scheme's `available_channels`, `"Find Partner Banks & Official Portals for This Scheme"` (`/locator?scheme=<code>`), and `"Save Application & Get Tracking ID"` (`/track`).
- Synced new `paths` and `locator.choose` i18n keys across `frontend/src/locales/en.json`, `hi.json`, and all 23 `core/translations/*.json` bundles.

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
