# Saksham Setu (सक्षम सेतु)

**AI-Powered Multilingual Government Loan Scheme Discovery, Funded Partner Bank Locator & Financial Guidance Portal**

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-5.1-green.svg)](https://www.djangoproject.com/)
[![React](https://img.shields.io/badge/React-18%20%2B%20Vite-61DAFB.svg)](https://react.dev/)
[![Languages](https://img.shields.io/badge/Indian%20Languages-22%20%2B%20English-orange.svg)](#2-core-features)
[![Tests](https://img.shields.io/badge/Django%20Tests-70%20Passing-brightgreen.svg)](#6-local-setup--run-instructions-windows)

> **Live Deployed URL:** _Add your live Render HTTPS URL here after Step 3_  
> **Prompt Engineering Log:** See [`PROMPTS.md`](./PROMPTS.md) for the complete chronological prompt chain (`P0` → `P11`), error corrections, security audits, and AI-to-AI handoffs.

---

## 1. Problem Statement, Purpose & Target Audience

### The Problem
Concessional credit and education loans for Scheduled Caste (SC) and underserved entrepreneurs—administered by **NSFDC** (National Scheduled Castes Finance and Development Corporation), **NBCFDC**, **NMDFC**, **NSTFDC**, **NSKFDC**, and State Channelizing Agencies (SCAs)—are not disbursed directly to citizens. Instead, funds flow through **100+ channel partners** (SCAs, Public Sector Banks, Regional Rural Banks, and NBFC-MFIs).

First-time borrowers face four major barriers:
1. **Scheme Confusion:** Navigating 60+ Central and State loan schemes with differing income ceilings, age limits, subsidies, and collateral rules.
2. **State-Specific Caste Rules (Article 341):** Scheduled Caste lists vary by state under Article 341 of the Constitution; inter-state migration or state-specific caste classification (e.g., *Dhobi* notified as SC in Rajasthan vs. OBC in Gujarat) frequently causes certificate rejection.
3. **Misrouted Applications:** Applying at branches with exhausted quotas or high Non-Performing Assets (NPAs) leads to silent delays, pushing families toward informal moneylenders charging 30%+ interest.
4. **Language & Digital Literacy Barriers:** Most portals are English-heavy and inaccessible to rural and semi-urban users on budget Android devices[cite: 2].

### Purpose & Target Users
- **Target Audience:** Rural and semi-urban Scheduled Caste entrepreneurs, women-led SHGs, sanitation workers, artisans, and students across India, including first-time internet users and visually impaired citizens[cite: 2].
- **Constitutional Alignment:** Supports **Article 46** (promotion of educational and economic interests of SCs and weaker sections) and **Article 38** (social justice and welfare).
- **Declared Reference Disclosure:** Our earlier Smart India Hackathon (SIH) prototype ([`TusharMital/saksham-setu`](https://github.com/TusharMital/saksham-setu)) was used strictly as a declared, read-only domain reference; this project was rebuilt cleanly inside `Saksham_Setu` using documented AI prompts[cite: 2].

---

## 2. Core Features

1. **66-Scheme All-India Catalog & Explainable 2-Layer Recommender (`/form`, `/results`, `/schemes`, `/scheme/:code`):**
   - Covers **66 verified Central, National Corporation (NSFDC/NBCFDC/NMDFC/NSTFDC/NSKFDC), and 26 State flagship schemes**.
   - **Layer 1 (Hard Filter) + Layer 2 (Weighted Scoring out of 100):** Evaluates interest rate, subsidy/margin share, loan-amount fit, and special eligibility (women-led, PwD, sanitation worker, SHG/JLG, skill certificate)[cite: 2].
   - **Transparent Decisions:** Every eligible scheme shows a match score and visual SVG repayment graph; every non-selected scheme appears in an expandable section with **plain-language multi-point rejection reasons**.
   - **3-Scheme Split-Window Comparison:** Side-by-side comparison of summary terms, EMI details, and caveats.
2. **State Category & DoPT EWS Document Verification Engine (`POST /api/verify-category/`):**
   - Deterministic rule engine checking MoSJE **Article 341** regional caste classifications, inter-state certificate domicile warnings, and **DoPT 2019 EWS** income/asset thresholds, paired with All-India 6-digit PIN auto-detection (`data/india_districts.json` + India Post API).
3. **23-Language Accessibility, RTL & 2-Way Voice Engine (`GET /api/i18n/<lang>/`, `POST /api/i18n/translate-schemes/`):**
   - Supports **English + all 22 Scheduled Languages of India** (Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Manipuri, Marathi, Nepali, Odia, Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, Urdu)[cite: 2].
   - Full **RTL (`dir="rtl"`)** layout and `<bdi>` numeric formatting for **Urdu (`ur`)**, **Kashmiri (`ks`)**, and **Sindhi (`sd`)**[cite: 2].
   - **Global Hover-to-Speak Toggle** for visually impaired users + **2-Way Voice** (Mic STT + Auto-Speak/Replay) inside Sarthi AI[cite: 2].
4. **Dual-Mode Loan EMI Calculator (`/calculator`):**
   - **General Market Mode:** 7 loan-type presets, fine-step sliders paired with direct numeric inputs, interactive Principal-vs-Interest Donut chart, Year-by-Year Balance graph, and amortization schedule.
   - **Locked Government Scheme Mode:** Locks sliders to official scheme rates, moratoriums, and tenures while computing savings against commercial bank loans.
5. **Scheme-Driven Live Partner Bank & Portal Locator (`/locator?scheme=<code>`):**
   - Integrates **Leaflet + Esri World Street Map tiles**, **OpenStreetMap Overpass API**, **Nominatim / India Post PIN geocoding**, Google Maps turn-by-turn directions, and one-tap `tel:` helpline calling.
   - Displays partner **Health Bars** (Fund Quota, Scheme Support, Low NPA) and a **"More Details"** modal listing all schemes provided by that institution and all its branches.
6. **Sarthi AI Chatbot & 3-Question Path Advisor (`POST /api/chat/`):**
   - Powered by **Groq API** (`llama-3.3-70b-versatile` with automatic `llama-3.1-8b-instant` fallback) grounded in whole `LoanScheme` DB records.
   - Includes an interactive **3-Question Path Advisor** on `/apply` and multi-layer security: HMAC-signed assistant history, `ipaddress`-validated rate limiting, regex sentinels (`[[UNKNOWN]]`, `[[OFFTOPIC]]`), URL stripping, numeric verification, and script validation.

---

## 3. Tech Stack & Architecture

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite 5, React Router, Custom CSS Variables (Mobile-First 360px, WCAG AA), Leaflet, Chart.js, Web Speech API |
| **Backend** | Python 3.11+, Django 5.1, Django REST Framework, SQLite, WhiteNoise, `django-cors-headers`, `python-dotenv` |
| **AI & External APIs** | Groq Chat Completions API (`GROQ_API_KEY` via `.env`), OpenStreetMap Overpass API, Nominatim Geocoder, India Post PIN API, Esri World Street Map Tiles |
| **Testing & Quality** | 70 automated Django unit & integration tests (`core/tests.py`), `{placeholder}` i18n bundle validator (`core/i18n_validator.py`) |

---

## 4. AI Tools Used & Contributions

| AI Tool | How It Was Used in Saksham Setu | Key Prompts & Evidence |
| :--- | :--- | :--- |
| **Cursor** *(Grok 4.6 Medium)* | Generated the initial full-stack scaffold (57 files across Django & React) from our structured 5-part `P0` specification before hitting usage limits[cite: 2]. | `P0` (`docs/02_Initial_Prompt/`) |
| **Antigravity** | Audited `P0` (`P0b`), generated migrations & seed data (`P0c`), wired Bolt+Figma UI, built the 23-language engine, 66-scheme catalog, dual-mode EMI calculator, Esri/Overpass bank locator, and applied `P9` security hardening[cite: 2]. | `P0b`–`P0c`, `P4`–`P9` (`docs/03_AI_Tools/`) |
| **Bolt.new & Figma** | Designed responsive GovTech Saffron-White-Green UI prototypes, 3-step form cards, and bank Health Bar layouts combined into `frontend/`[cite: 2]. | `P4`, `P4a` (`docs/03_AI_Tools/p4_*.png`) |
| **ChatGPT** | Conducted reverse prompting on our 22-Indian-language + RTL + Web Speech architecture (`P5a`) and refined `P0` → `P0 v2` (`P10`)[cite: 2]. | `P5a`, `P10` (`docs/03_AI_Tools/p5_chatgpt_22lang_spec.png`, `docs/04_Prompt_Improvements/p10_reverse_prompt_p0.png`) |
| **Perplexity** | Researched citation-backed eligibility rules, ceilings, and portal URLs for Central Government and 26 State flagship schemes. | `P7a` (`docs/03_AI_Tools/p7a_perplexity_all_schemes.png`) |
| **Google Gemini** | Guided project architecture, multi-tool prompt chaining, and screenshot-driven bug triage (`P8a`, `P8b`)[cite: 2]. | `P8a`, `P8b` (`docs/04_Prompt_Improvements/`) |
| **Claude** | Performed two-pass security, prompt-injection & grounding code audits on `core/chatbot.py` and `core/views.py` (`29/50` → `35/50` → hardened). | `P9` (`docs/03_AI_Tools/p9_claude_review_*.png`) |

---

## 5. Team Contributions

| Member | Roll No. | GitHub | Responsibilities & Actual Contributions |
| :--- | :--- | :--- | :--- |
| **Tushar Mital** *(Team Lead)* | `25bcon2455` | `@TusharMital` | System architecture, initial `P0` prompt & Cursor/Antigravity backend setup, Django models/migrations/seed data, State Category & EWS verification engine, 66-scheme recommender, Groq Sarthi chatbot & live API testing, deployment[cite: 2]. |
| **Bhumi** | `25bcon2360` | `@bhumi25bcon2360` | Bolt.new & Figma GovTech UI/UX design, 3-step form & PIN/district UX, scheme-driven `/apply` & `/locator` UI & partner bank research, 23-language localization bundles, RTL & Hindi/Urdu accessibility testing[cite: 2]. |
| **Mousam** | `25bcon2411` | `@mousamdev2008` | ChatGPT architectural reverse prompting (`P5a`, `P10`), Perplexity Central/State scheme research (`P7a`), Overpass/Esri live bank & portal locator backend/frontend coding (`P7d`, `P8b`), Claude two-pass security audit & hardening (`P9`), `PROMPTS.md` & `README.md`[cite: 2]. |

---

## 6. Local Setup & Run Instructions (Windows)

### Prerequisites
- Python **3.11+** and Node.js **18+**
- A free Groq API key from [console.groq.com](https://console.groq.com)[cite: 2]

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
GROQ_MODEL=llama-3.3-70b-versatile
DJANGO_SECRET_KEY=your-local-secret-key
EOF

# 4. Run database migrations and seed the 66-scheme & branch catalog
python manage.py migrate
python manage.py seed_data

# 5. Build the React frontend and collect static files
npm --prefix frontend install
npm --prefix frontend run build
python manage.py collectstatic --noinput

# 6. Run the automated test suite (70 tests)
python manage.py test

# 7. Start the unified Django + React server
python manage.py runserver 127.0.0.1:8000