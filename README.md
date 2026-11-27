# Saksham Setu (सक्षम सेतु)
**AI-Powered Multilingual Government Loan Scheme Discovery, Funded Partner Bank Locator & Financial Guidance Portal**

[![Live Demo](https://img.shields.io/badge/Live_Demo-sakshamsetuv2.vercel.app-E65100?style=for-the-badge&logo=vercel&logoColor=white)](https://sakshamsetuv2.vercel.app/)
[![Backend](https://img.shields.io/badge/Django-5.1-1B5E20?style=for-the-badge&logo=django&logoColor=white)](https://www.djangoproject.com/)
[![Frontend](https://img.shields.io/badge/React_18-Vite_5-0D47A1?style=for-the-badge&logo=react&logoColor=white)](https://vitejs.dev/)
[![AI Engine](https://img.shields.io/badge/Groq_AI-gpt--oss--120b-111827?style=for-the-badge)](https://console.groq.com/)
[![Languages](https://img.shields.io/badge/Languages-23_Indian_%2B_RTL-6A1B9A?style=for-the-badge)](#2-core-features)
[![Tests](https://img.shields.io/badge/Automated_Tests-81_Passing-2E7D32?style=for-the-badge)](#6-local-setup--run-instructions-windows)

> **Live Deployed URL:** https://sakshamsetuv2.vercel.app/  
> **Health Check Endpoint:** https://sakshamsetuv2.vercel.app/api/health/  
> **Prompt Engineering Log:** See [`PROMPTS.md`](./PROMPTS.md) for the chronological prompt chain (`P0` → `P11`), error corrections, security audits, and AI-to-AI handoffs.

---

## 1. Problem Statement, Purpose & Target Audience

### The Problem
Concessional credit and education loans for Scheduled Caste (SC) and underserved entrepreneurs—administered by **NSFDC** (National Scheduled Castes Finance and Development Corporation), **NBCFDC**, **NMDFC**, **NSTFDC**, **NSKFDC**, and **State Channelizing Agencies (SCAs)**—are not disbursed directly to citizens. Instead, funds flow through 100+ channel partners (SCAs, Public Sector Banks, Regional Rural Banks, and NBFC-MFIs). First-time borrowers face four major barriers:

1. **Scheme Fragmentation:** Navigating 66 Central and State loan schemes with differing income ceilings, age limits, subsidies, and collateral rules.
2. **State-Specific Caste Rules (Article 341):** Scheduled Caste notifications vary by state under Article 341 of the Constitution; inter-state migration or state-specific caste classification (e.g., *Dhobi* notified as SC in Rajasthan vs. OBC in Gujarat) frequently causes certificate rejection.
3. **Misrouted Applications:** Applying at branches with exhausted quotas or high Non-Performing Assets (NPAs) leads to silent delays, pushing families toward informal moneylenders charging 30%+ interest.
4. **Language & Digital Literacy Barriers:** Most portals are English-heavy and difficult to navigate for rural and semi-urban users on budget Android devices.

### Purpose & Target Users
* **Target Audience:** Rural and semi-urban Scheduled Caste entrepreneurs, women-led SHGs, sanitation workers, artisans, EWS/OBC/ST/Minority micro-entrepreneurs, and students across India, including first-time internet users and visually impaired citizens.
* **Constitutional Alignment:** Advances **Article 46** (promotion of educational and economic interests of SCs and weaker sections) and **Article 38** (social justice and welfare).
* **Declared Reference Disclosure:** Our earlier Smart India Hackathon (SIH) prototype (`TusharMital/saksham-setu`) was used strictly as a declared, read-only domain reference; this project was architected and rebuilt cleanly inside `Saksham_Setu` using documented multi-tool AI prompts.

---

## 2. Core Features

1. **66-Scheme All-India Catalog & Explainable 2-Layer Recommender (`/form`, `/results`, `/schemes`, `/scheme/:code`)**
   * Covers **66 verified schemes** across NSFDC, National Social-Justice Corporations (NBCFDC, NMDFC, NSTFDC, NSKFDC), Central flagship credit schemes (PM MUDRA, PMEGP, Stand-Up India, PM Vishwakarma, PM SVANidhi, PM-Vidyalaxmi), and **26 State flagship schemes**.
   * **Layer 1 (Hard Filter) + Layer 2 (Weighted Scoring out of 100):** Evaluates state applicability, caste/social category, income ceiling, age range, loan-amount fit, interest rate, subsidy share, and special eligibility (women-led, PwD, sanitation worker, skill certificate, SHG/JLG).
   * **Transparent Decisions:** Eligible schemes display a match percentage and visual SVG EMI repayment graph; non-selected schemes appear in an expandable section with plain-language multi-point rejection reasons.
   * **3-Scheme Split-Window Comparison:** Side-by-side comparison of summary terms, EMI details, and important caveats.

2. **State Category & DoPT EWS Document Verification Engine (`POST /api/verify-category/`)**
   * Deterministic rule engine checking MoSJE Article 341 regional caste classifications, inter-state certificate domicile warnings, and DoPT 2019 EWS income/asset thresholds (`< ₹8,00,000`), paired with All-India 6-digit PIN auto-detection (`data/india_districts.json` + India Post API).

3. **23-Language Accessibility, RTL & 2-Way Voice Engine (`GET /api/i18n/<lang>/`, `POST /api/i18n/translate-schemes/`)**
   * Supports **English + all 22 Scheduled Languages of India** (Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Manipuri, Marathi, Nepali, Odia, Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, Urdu).
   * Full **RTL (`dir="rtl"`)** layout and `<bdi>` numeric formatting for **Urdu (`ur`)**, **Kashmiri (`ks`)**, and **Sindhi (`sd`)**.
   * Global **Hover-to-Speak Toggle** for visually impaired users + **2-Way Voice** (Mic STT + Auto-Speak/Replay) inside Sarthi AI.

4. **Dual-Mode Loan EMI Calculator (`/calculator`)**
   * **General Market Mode:** 7 loan-type presets, fine-step sliders paired with direct numeric inputs, interactive Principal-vs-Interest Doughnut chart, and full amortization schedule.
   * **Locked Government Scheme Mode:** Locks sliders to official scheme rates, moratoriums, and tenures while computing interest savings against commercial bank loans.

5. **Scheme-Driven Live Partner Bank & Official Portal Locator (`/locator?scheme=<code>`)**
   * Integrates **Leaflet + Esri World Street Map tiles**, **OpenStreetMap Overpass API**, **Nominatim / India Post PIN geocoding**, live GPS location, Google Maps turn-by-turn directions, and one-tap `tel:` helpline calling.
   * Displays partner Health Bars (Fund Quota, Scheme Support, Low NPA) and a **"More Details"** modal listing all schemes provided by that institution and all its branches.

6. **Sarthi AI Chatbot & 3-Question Path Advisor (`POST /api/chat/`, `/apply`)**
   * Powered by **Groq Chat Completions API** (`openai/gpt-oss-120b` with automatic fallback to `openai/gpt-oss-20b` and `qwen/qwen3.8-27b`) grounded directly in verified `LoanScheme` database records.
   * Includes an interactive **3-Question Path Advisor** on `/apply` and multi-layer security: HMAC-signed assistant history, `ipaddress`-validated rate limiting, regex sentinels (`[[UNKNOWN]]`, `[[OFFTOPIC]]`), URL stripping, numeric verification, and script validation.

7. **Unified 6-Stage Application & Official Portal Tracker (`/track`)**
   * Tracks applications across a **6-stage visual timeline** (`Profile Matched` → `Documents Verified` → `Submitted on Official Portal` → `Bank/SCA Appraisal` → `Sanction Approved` → `Disbursed`), links official portal ARN/Reference IDs (`PATCH /api/applications/<tracking_id>/`), checks live portal reachability (`GET /api/track/portal-info/`), and provides one-click Reference ID copy + direct launch to the official portal.

---

## 3. Tech Stack & Architecture

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite 5, React Router, Custom CSS Variables (Mobile-First `360px`, WCAG AA), Leaflet, Chart.js, Web Speech API |
| **Backend** | Python 3.12+, Django 5.1, Django REST Framework, SQLite (writable `/tmp/db.sqlite3` cold-start adapter on Vercel), WhiteNoise, `django-cors-headers` |
| **AI & External APIs** | Groq Chat Completions API (`openai/gpt-oss-120b`), OpenStreetMap Overpass API, Nominatim Geocoder, India Post PIN API, Esri World Street Map Tiles |
| **Cloud Deployment** | Vercel Multi-Service Architecture (`frontend` Vite static edge + `backend` native Django WSGI serverless runtime) |
| **Testing & Quality** | **81 automated Django unit & integration tests** (`core/tests.py`), `{placeholder}` i18n bundle validator (`core/i18n_validator.py`), `GET /api/health/` monitor |

---

## 4. AI Tools Used & Contributions

| AI Tool | Role & Contributions in Saksham Setu | Prompt Chain Reference |
| :--- | :--- | :--- |
| **Cursor** | Generated the initial 57-file Django 5 + React 18 scaffold from our structured 5-part `P0` specification before hitting usage limits. | `P0` |
| **Antigravity** | Audited `P0` (`P0b`), built migrations & 66-scheme seeders (`P0c`), wired Bolt + Figma UI, implemented the 23-language engine, EWS/Article 341 verifier, SVG EMI graph, Overpass/Esri bank locator, 6-stage tracker, and Vercel deployment adapter. | `P0b`–`P0c`, `P4`–`P8`, Deploy |
| **Bolt.new & Figma** | Designed responsive GovTech Saffron-White-Green UI prototypes, 3-step form cards, and bank Health Bar layouts integrated into `frontend/`. | `P4`, `P4a` |
| **ChatGPT** | Conducted architectural reverse prompting on our 22-Indian-language + RTL + Web Speech pipeline (`P5a`) and refined `P0` → `P0 v2` (`P10`). | `P5a`, `P10` |
| **Perplexity AI** | Researched citation-backed eligibility rules, income ceilings, subsidies, and official portal URLs across 66 Central and State schemes (`P7a`). | `P7a` |
| **Google Gemini** | Guided system architecture, multi-tool prompt chaining, adversarial validation, bug triage (`P8a`, `P8b`), and Vercel production deployment. | `P8a`, `P8b`, Deploy |
| **Claude** | Performed two-pass security, prompt-injection, and grounding code audits on `core/chatbot.py` and `core/views.py` (`29/50` → `35/50` → hardened). | `P9` |
| **Groq API** | Powers real-time multilingual **Sarthi AI** responses (`openai/gpt-oss-120b`) grounded in live database scheme records. | Production Runtime |

---

## 5. Team Contributions

| Member | Roll No. | GitHub | Responsibilities & Actual Contributions |
| :--- | :--- | :--- | :--- |
| **Tushar Mital** *(Team Lead)* | `25bcon2455` | [@TusharMital](https://github.com/TusharMital) | System architecture, initial `P0` prompt & Cursor/Antigravity backend setup, Django models/migrations/seed data, State Category & EWS verification engine, 66-scheme recommender, Groq Sarthi chatbot & live API testing, Vercel production deployment. |
| **Bhumi** | `25bcon2360` | [@bhumi25bcon2360](https://github.com/bhumi25bcon2360) | Bolt.new & Figma GovTech UI/UX design, 3-step form & PIN/district UX, scheme-driven `/apply` & `/locator` UI, 23-language localization bundles, RTL & Hindi/Urdu accessibility testing. |
| **Mousam** | `25bcon2411` | [@mousamdev2008](https://github.com/mousamdev2008) | ChatGPT architectural reverse prompting (`P5a`, `P10`), Perplexity Central/State scheme research (`P7a`), Overpass/Esri live bank & portal locator coding (`P7d`, `P8b`), Claude two-pass security audit & hardening (`P9`), `PROMPTS.md` & `README.md`. |

---

## 6. Local Setup & Run Instructions (Windows)

### Prerequisites
* **Python 3.11+** and **Node.js 18+**
* A free Groq API key from [console.groq.com](https://console.groq.com)

### Step-by-Step Commands (Git Bash / PowerShell)

```bash
# 1. Clone the repository
git clone [https://github.com/TusharMital/Saksham_Setu.git](https://github.com/TusharMital/Saksham_Setu.git)
cd Saksham_Setu

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Create environment variables in .env (never commit .env)
cat << 'EOF' > .env
GROQ_API_KEY=gsk_your_actual_key_here
GROQ_MODEL=openai/gpt-oss-120b
DJANGO_SECRET_KEY=your-local-secret-key
EOF

# 4. Run database migrations and seed the 66-scheme & branch catalog
python manage.py migrate
python manage.py seed_data

# 5. Build the React frontend and collect static files
npm --prefix frontend install
npm --prefix frontend run build
python manage.py collectstatic --noinput

# 6. Run the automated test suite (81 tests)
python manage.py test

# 7. Start the unified Django + React server
python manage.py runserver 127.0.0.1:8000