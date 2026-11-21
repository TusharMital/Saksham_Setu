# Saksham Setu (साक्षम सेतु) — Audit & Acceptance Report

---

## 1. Module Status Table

| # | Module | Status | Primary Files | Observations & Current State |
|---|---|---|---|---|
| 1 | **Landing Page** | **Complete** *(Unbuilt)* | `frontend/src/pages/Landing.jsx`<br>`frontend/src/components/Layout.jsx`<br>`frontend/src/locales/en.json`, `hi.json` | 1-line promise, large CTA button (`/form`), English/Hindi toggle, 4-step "How it works" strip. Code is complete; awaits frontend build. |
| 2 | **Three-Step Form** | **Complete** *(Unbuilt)* | `frontend/src/pages/Form.jsx`<br>`frontend/src/components/HelpField.jsx`<br>`frontend/src/speech.js`<br>`frontend/src/state.jsx`<br>`core/validation.py` | Step 1 (identity/income), Step 2 (project/loan), Step 3 (special eligibility). Floating "i" bubble, speech synthesis (listen), Web Speech API (mic input), inline validation, session persistence. Backend validation in `validate_applicant`. |
| 3 | **Recommender** | **Complete** *(Unmigrated)* | `core/recommender.py`<br>`core/views.py`<br>`frontend/src/pages/Results.jsx` | 2-layer recommender: Layer 1 hard filter (state, income ceiling, age, loan limits, applicant type, women/PwD flags) with 1-line reasons; Layer 2 weighted scoring (100 pts: interest 35, subsidy 25, loan fit 20, special bonus 20). Top 3 display with "Best for you" badge and collapsed rejected list. |
| 4 | **Loan Calculator** | **Complete** *(Unbuilt)* | `core/emi.py`<br>`core/views.py`<br>`core/validation.py`<br>`frontend/src/pages/Calculator.jsx` | Monthly EMI formula, moratorium support, amortization schedule table, Chart.js doughnut chart, pre-filling from selected scheme. |
| 5 | **Branch Locator** | **Complete** *(Unmigrated/Unbuilt)* | `core/geo.py`<br>`core/views.py`<br>`pin_lookup.json`<br>`frontend/src/pages/Locator.jsx` | Haversine distance, PIN lookup table, normalized branch scoring (`0.5*dist + 0.3*quota - 0.2*npa` with zero-fund penalty), 3-check Health Bar (funds, scheme, NPA), Google Maps directions, Leaflet map with markers. |
| 6 | **Application Paths** | **Complete** *(Unbuilt)* | `frontend/src/pages/ApplyPath.jsx` | 3 distinct paths: Offline via nearest partner (routes to `/locator`), Bank portal (steps, video placeholder, external link, doc helper CTA), Government portal (steps, video placeholder, external link). |
| 7 | **Document Helper & PDF** | **Complete** *(Unmigrated)* | `core/pdf_generator.py`<br>`core/views.py`<br>`frontend/src/pages/Documents.jsx` | Checklist from scheme, extra partner fields (IFSC, Udyam), application record creation, downloadable ReportLab PDF with "DEMO DOCUMENT" watermark and demo disclaimer. |
| 8 | **Status Tracker** | **Complete** *(Unmigrated)* | `core/views.py`<br>`core/management/commands/seed_data.py`<br>`frontend/src/pages/Tracker.jsx` | Reference search, 4-stage visual timeline (Submitted, Document Verification, Field/Police Verification, Decision), pending documents, and rejection reason with fix suggestions. 4 sample records seeded in `seed_data.py`. |
| 9 | **Sarthi Chatbot** | **Complete** *(Needs Groq Key)* | `core/chatbot.py`<br>`core/views.py`<br>`frontend/src/components/Sarthi.jsx` | Floating widget on all pages, bilingual (HI/EN), typing indicator, suggested prompts, memory of last 6 messages, Groq completion grounded with `schemes.json`, rate limiting, and friendly error handlers (empty, >500 chars, 401, 429, timeout, network failure). |
| 10 | **Django Admin** | **Complete** *(Unmigrated)* | `core/admin.py` | Models `LoanScheme`, `Branch`, and `Application` registered with list displays, filters, and search fields. |

---

## 2. API Endpoints Table

| Method | Path | Exists | Wired in `core/urls.py` | Tested | Backing View / Function |
|---|---|---|---|---|---|
| `POST` | `/api/recommend/` | Yes | Yes | **Partial** (Logic tested in `tests.py`; HTTP endpoint untested) | `core.views.RecommendView`<br>calls `core.recommender.recommend` |
| `GET` | `/api/schemes/` | Yes | Yes | **No** (Untested via HTTP) | `core.views.SchemeListView` |
| `GET` | `/api/branches/?scheme=&lat=&lng=` | Yes | Yes | **Partial** (Logic tested in `tests.py`; HTTP endpoint untested) | `core.views.BranchListView`<br>calls `core.geo.rank_branches` |
| `POST` | `/api/emi/` | Yes | Yes | **Partial** (Logic tested in `tests.py`; HTTP endpoint untested) | `core.views.EmiView`<br>calls `core.emi.calculate_emi` |
| `GET` | `/api/applications/<ref>/` | Yes | Yes | **No** (Untested via HTTP) | `core.views.ApplicationDetailView` |
| `GET` | `/api/applications/<ref>/pdf/` | Yes | Yes | **No** (Untested via HTTP) | `core.views.ApplicationPdfView`<br>calls `core.pdf_generator.generate_application_pdf` |
| `POST` | `/api/chat/` | Yes | Yes | **Yes** (`ChatApiTests.test_empty_message_returns_400`) | `core.views.ChatView`<br>calls `core.chatbot.chat_completion` |
| `POST` | `/api/applications/` *(extra)* | Yes | Yes | **No** (Untested via HTTP) | `core.views.ApplicationCreateView` *(needed by Documents.jsx)* |
| `GET` | `/api/pin-lookup/` *(extra)* | Yes | Yes | **No** (Untested via HTTP) | `core.views.PinLookupView` *(needed by Locator.jsx)* |

---

## 3. Problems Found, Ranked by Severity

### Critical (Blocks running the app)
1. **Missing Database Migrations (`core/migrations/` has no migration files)**:
   `core/migrations/` only contains an empty `__init__.py`. No schema migrations exist for `LoanScheme`, `Branch`, and `Application`. Running `python manage.py migrate` or attempting to launch Django against `db.sqlite3` fails to create or access the core database tables.
2. **Uninitialized Database (`db.sqlite3` does not exist)**:
   The database has never been migrated or seeded.
3. **Frontend Build Missing (`frontend/dist` does not exist)**:
   Django’s `SpaFallbackView` and WhiteNoise are configured to serve files from `frontend/dist`. Because Vite has not been built, accessing any web route on Django returns `404: Frontend build not found`.

### High (Blocks deployment & complete functionality)
4. **Root vs Frontend `package.json` workflow**:
   Root `package.json` delegates commands via `npm --prefix frontend run dev/build`. However, developers executing `npm install` at the root will find no dependencies installed. Dependencies are located inside `frontend/package.json` (where `npm install` has been populated with `node_modules` and `package-lock.json`).
5. **Missing `.env` configuration file**:
   Only `.env.example` exists. While Django settings supply local fallbacks, `GROQ_API_KEY` is blank, meaning `/api/chat/` will return friendly HTTP 401 until a key or mock is configured.

### Medium (Quality, warnings, and test coverage)
6. **Missing HTTP API Integration Tests in `core/tests.py`**:
   The current 9 unit tests in `core/tests.py` test pure Python logic modules (`recommender`, `emi`, `geo`), with only 1 HTTP test for `ChatApiTests`. The remaining 6 endpoints lack DRF `APIClient` test coverage.
7. **Python 3.14 Urllib3 / Requests Dependency Warning**:
   Python 3.14 emits: `RequestsDependencyWarning: urllib3 (2.7.0) or chardet (7.7.0)/charset_normalizer (3.5.1) doesn't match a supported version!` when importing `requests`. It executes cleanly, but is noisy.
8. **Missing `staticfiles` Directory UserWarning**:
   WhiteNoise emits a warning when `staticfiles` does not exist prior to `collectstatic`.

### Low (Code hygiene & rules compliance)
9. **Unused Import in `core/views.py`**:
   Line 12 imports `scheme_to_dict` from `core.recommender`, but it is unused in `views.py`.
10. **Missing `openapi.yaml` & `CHANGELOG.md`**:
    Required per project governance rules (`Rule 6`).

---

## 4. Acceptance Criteria Verification Table

| # | Acceptance Criterion | Status | Evidence (File & Function) | Verification Result |
|---|---|---|---|---|
| 1 | A woman applicant with income Rs 3 lakh in Rajasthan sees MSY ranked in the top 3. | **PASS** | `core/recommender.py`: `recommend()`, `layer1_reason()`, `layer2_score()`<br>`core/tests.py`: `RecommenderTests.test_msy_in_top3_for_woman_in_rajasthan` | Tested against `schemes.json` in Django environment. Top 3 results: `['VTA', 'MSY', 'MKY']`. MSY is rank #2. |
| 2 | An applicant with income Rs 6 lakh sees income-capped schemes rejected with the reason. | **PASS** | `core/recommender.py`: `layer1_reason()`<br>`core/tests.py`: `RecommenderTests.test_income_ceiling_rejection_reason` | Verified in Django shell. All 9 income-capped schemes in `schemes.json` are rejected with: *"Rejected: your income Rs 6 lakh is above the Rs 5 lakh limit."* |
| 3 | EMI for Rs 5,00,000 at 6% for 60 months comes to about Rs 9,666. | **PASS** | `core/emi.py`: `calculate_emi()`<br>`core/tests.py`: `EmiTests.test_five_lakh_six_percent_sixty_months` | Evaluates to `9666.4` (rounds to `Rs 9,666`). Test asserts within delta=2. |
| 4 | A partner next door with zero funds ranks below a farther partner that has funds. | **PASS** | `core/geo.py`: `rank_branches()` (`ZERO_FUND_PENALTY = 5.0`)<br>`core/tests.py`: `BranchScoreTests.test_zero_funds_next_door_ranks_below_funded_farther` | Evaluates distance penalty vs zero-fund deduction. Next-door empty desk (0 quota) is penalized by 5.0 pts and ranks below farther funded partner. |
| 5 | `/api/chat/` with an empty message returns 400 with a friendly message, not a crash. | **PASS** | `core/chatbot.py`: `chat_completion()`, `friendly()`<br>`core/views.py`: `ChatView.post()`<br>`core/tests.py`: `ChatApiTests.test_empty_message_returns_400` | Returns HTTP 400 with `{"error": true, "code": "empty", "message": "Please type a question about schemes, loans or documents."}`. |

---

## 5. Numbered Plan to Complete & Run the App

1. **Step 1: Database Migrations**
   - Create initial migration for `core` (`python manage.py makemigrations core`).
   - Run migrations (`python manage.py migrate`).
   - *Test:* Run `python manage.py showmigrations` and verify all tables exist in `db.sqlite3`.

2. **Step 2: Seed Demo Data**
   - Execute the management command (`python manage.py seed_data`).
   - *Test:* Verify count of `LoanScheme` (9), `Branch` (27), and `Application` (4) via Django shell.

3. **Step 3: Expand Test Suite & Project Governance**
   - Add DRF `APIClient` integration tests for all 7 endpoints in `core/tests.py`.
   - Remove unused import in `core/views.py`.
   - Initialize `openapi.yaml` and `CHANGELOG.md` per project rules.
   - *Test:* Run `python manage.py test` to ensure 100% of unit and integration tests pass.

4. **Step 4: Frontend Build & Asset Verification**
   - Run `npm --prefix frontend run build` to generate `frontend/dist`.
   - *Test:* Verify `frontend/dist/index.html` and bundled assets are created.

5. **Step 5: Django SPA Serving & Static Collection**
   - Run `python manage.py collectstatic --noinput` to prepare WhiteNoise.
   - *Test:* Start Django server and verify `GET /` serves the built React app and `/api/schemes/` responds with JSON.

6. **Step 6: End-to-End Workflow Verification**
   - Test complete user journey: Form submission -> Recommender results -> Calculator -> Branch locator with map -> Application paths -> Document helper & PDF generation (`/api/applications/<ref>/pdf/`) -> Status tracking (`SS-2026-10001` through `SS-2026-10004`) -> Sarthi chatbot.
   - *Test:* Automated curl or browser checks confirming 200 OK responses across all flows.

---

## 6. Clarifying Questions

1. **Groq API Key**: Do you have a live `GROQ_API_KEY` you want placed in `.env`, or should we configure Sarthi with a graceful offline fallback response when no key is present?
2. **Rule 11 (No demo data) vs Prototype Spec**: Project Rule 11 forbids synthetic/demo data in live apps, but this GovTech prototype specification explicitly directs us to seed `schemes.json`, `branches.json`, and 4 sample tracker applications with visible demo notices. Please confirm that executing `seed_data` for this prototype meets your intent.
3. **OpenAPI & Changelog Tracking (Rule 6)**: Would you like us to generate the complete `openapi.yaml` documenting all 7 endpoints and initiate `CHANGELOG.md` starting with Step 1?
4. **Development Mode Setup**: For your local testing, do you prefer running the separate dual-server dev flow (`npm --prefix frontend run dev` on 5173 with proxy to Django on 8000), or testing directly against the unified Django server serving the built frontend?
5. **PDF ReportLab Customization**: Does the generated demo application summary PDF require any additional specific fields (such as application submission timestamp or bar code placeholder) beyond the current checklist and applicant block?

*(Awaiting your reply before taking any action. No files have been created, modified, or deleted.)*