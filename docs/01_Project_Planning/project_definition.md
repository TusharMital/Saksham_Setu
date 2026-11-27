# Project Definition — Saksham Setu (सक्षम सेतु)

## Project Name
**Saksham Setu (सक्षम सेतु): AI-Powered Multilingual Government Loan Scheme Discovery, Funded Partner Bank Locator & Financial Guidance Portal**

* **Live Deployed URL:** https://sakshamsetuv2.vercel.app/
* **Health Check Endpoint:** https://sakshamsetuv2.vercel.app/api/health/
* **GitHub Repository:** https://github.com/TusharMital/Saksham_Setu
* **Prompt Engineering Log:** [`PROMPTS.md`](../../PROMPTS.md)

---

## Problem Statement
Concessional credit and education loans for Scheduled Caste (SC) and underserved entrepreneurs—offered through **NSFDC**, **NBCFDC**, **NMDFC**, **NSTFDC**, **NSKFDC**, and State Channelizing Agencies (SCAs)—are not disbursed directly to citizens. Instead, funds are routed through 100+ channel partners: SCAs, Public Sector Banks (PSBs), Regional Rural Banks (RRBs), and NBFC-MFIs.

First-time applicants face four major problems:
1. **Scheme Confusion:** They do not know which of the 66 Central and State loan schemes they are eligible for across differing income ceilings, age limits, subsidies, and collateral rules.
2. **Misrouted Applications:** They do not know which nearby partner branch can serve them. Applications often reach branches that have exhausted their fund quota or carry high Non-Performing Assets (NPAs), causing files to stall.
3. **State-Specific Caste Rules (Article 341):** Scheduled Caste lists differ by state under Article 341 of the Constitution, so inter-state migration or state-domicile mismatches cause frequent certificate rejections.
4. **Unexplained Rejections & Language Barriers:** Rejections arrive without clear remediation steps on English-heavy portals, pushing vulnerable families toward informal moneylenders charging 30% or more.

---

## Purpose
To help applicants discover the exact Central or State loan scheme they qualify for, verify state caste and EWS document rules, reach a nearby partner bank that actually has funds, and track their application across a 6-stage timeline—with every step explained in simple Hindi, English, or any of India's 22 Scheduled Languages.

---

## Target Audience
Rural and semi-urban Scheduled Caste (SC) entrepreneurs, women-led Self-Help Groups (SHGs), sanitation workers, traditional artisans, EWS/OBC/ST/Minority micro-entrepreneurs, and students across India—including first-time internet users on budget Android smartphones and visually impaired citizens.

---

## Proposed Solution
A full-stack web application deployed on **Vercel** (`https://sakshamsetuv2.vercel.app/`) featuring:

* **3-Step Smart Form & All-India PIN Auto-Lookup (`/form`):** Captures personal, business, and special-eligibility details with inline validation, click-to-toggle `?` help bubbles, and automatic State/District detection from any 6-digit Indian PIN code (via `data/india_districts.json` and the India Post PIN API).
* **66-Scheme Explainable 2-Layer Recommender & 3-Scheme Split Comparison (`/results`, `/schemes`, `/scheme/:code`):**
  * **Layer 1 (Hard Filter):** Validates state applicability (`ALL` vs. 26 State flagships), caste/social category, income ceiling, age range, loan bounds, and women/PwD flags.
  * **Layer 2 (Weighted Scoring out of 100):** Scores interest rate competitiveness, subsidy/margin support, loan-amount fit, and special-eligibility bonuses.
  * **Explainability & Comparison:** Displays plain-language match and multi-point rejection reasons, dedicated `/scheme/:code` detail pages with visual SVG EMI repayment graphs, scheme-specific required document checklists, channel-filtered apply actions, and a 3-scheme side-by-side split-window comparator.
* **State Category (Article 341) & DoPT EWS Verification Engine (`POST /api/verify-category/`):** Deterministic rule engine flagging regional caste classification differences, inter-state certificate domicile warnings, and DoPT 2019 EWS income/asset thresholds (`< ₹8,00,000`).
* **Dual-Mode Loan & Subsidy EMI Calculator (`/calculator`):** Supports both General Market presets and Locked Government Scheme parameters, calculating monthly EMI, total interest, moratorium impact, commercial-bank savings, interactive Principal-vs-Interest Doughnut chart, and month-wise amortization schedule.
* **Scheme-Driven Live Partner Bank Locator & Health Bar (`/locator?scheme=<code>`):** Integrates Leaflet + Esri World Street Map tiles, OpenStreetMap Overpass API, Nominatim/India Post geocoding, and live GPS with a green/amber/red **Health Bar** (Fund Quota, Scheme Support, Low NPA), toll-free helplines, institution-wide scheme/branch modals, and Google Maps turn-by-turn directions.
* **Channel-Filtered Official Application Paths (`/apply?scheme=<code>`):** Displays only the official channels valid for the selected scheme (`PM-SURAJ`, `JanSamarth`, `SCA`, `Partner Bank`, `NBFC-MFI`, `KVIC`, `Stand-Up India`, `PM Vishwakarma`, or `State Portal`).
* **Unified 6-Stage Application & Official Portal Tracker (`/track`):** Tracks `SS-2026-...` applications across 6 stages (`Profile Matched` → `Documents Verified` → `Submitted on Official Portal` → `Bank/SCA Appraisal` → `Sanction Approved` → `Disbursed`), links official portal ARN/Reference IDs, checks live portal reachability, and provides plain-language rejection reasons with actionable fixes.
* **23-Language Accessibility, RTL & 2-Way Voice Engine:** Supports English + all 22 Scheduled Languages of India with full RTL (`dir="rtl"`) layout (`ur`, `ks`, `sd`) and a global **Hover-to-Speak** mode for visually impaired users.
* **Sarthi AI Chatbot & 3-Question Path Advisor (`POST /api/chat/`):** Floating multilingual chatbot powered by **Groq API (`openai/gpt-oss-120b`)**, grounded strictly in verified database scheme records with 2-way voice (Mic STT + Auto-Speak), HMAC-signed conversation history, per-IP rate limiting, domain sentinels (`[[UNKNOWN]]`, `[[OFFTOPIC]]`), URL stripping, and output numeric/script validation.

---

## How It Addresses the Problem

| Problem | Feature That Solves It |
| :--- | :--- |
| Doesn't know which Central or State scheme fits | 3-Step Smart Form, 66-Scheme 2-Layer Recommender, and 3-Scheme Split Comparator |
| Applications reach branches with exhausted funds or high NPAs | Geo-spatial Branch Score and Green/Amber/Red Partner Health Bar |
| State caste-list & domicile mismatch (Article 341) | State Category & DoPT EWS Verification Engine with inter-state warnings |
| Rejections with no explanation or portal visibility | Unified 6-Stage Tracker with ARN sync, rejection reasons, and remediation steps |
| Low digital literacy, regional language & visual barriers | 23 Indian Languages + RTL, Hover-to-Speak accessibility, and 2-Way Voice Sarthi AI |

---

## Technology

* **Frontend:** React 18, Vite 5, React Router, Custom CSS Variables (Mobile-First `360px`, WCAG AA), Leaflet + Esri World Street Map Tiles, Chart.js, Web Speech API
* **Backend:** Python 3.12, Django 5.1, Django REST Framework, SQLite (writable `/tmp/db.sqlite3` cold-start adapter on Vercel), WhiteNoise, `django-cors-headers` (81 automated unit & integration tests)
* **AI & External APIs:** Groq Chat Completions API (`openai/gpt-oss-120b` with multi-model fallback), OpenStreetMap Overpass API, Nominatim Geocoder, India Post PIN API
* **Deployment:** Vercel Multi-Service Architecture (`https://sakshamsetuv2.vercel.app/`)

---

## AI Tools Used

* **Cursor:** Generated the initial 57-file Django + React scaffold from the structured 5-part `P0` prompt before hitting usage limits.
* **Antigravity:** Audited `P0`, built migrations and 66-scheme seeders, integrated Bolt/Figma UI, built the 23-language engine, Article 341/EWS verifier, SVG EMI graph, Overpass/Esri bank locator, 6-stage tracker, and Vercel deployment adapter.
* **Bolt.new & Figma:** Designed responsive GovTech Saffron-White-Green UI prototypes, 3-step form cards, and bank Health Bar layouts.
* **ChatGPT:** Conducted architectural reverse prompting on the 22-Indian-language + RTL + Web Speech pipeline and refined `P0` → `P0 v2`.
* **Perplexity AI:** Researched citation-backed eligibility rules, income ceilings, subsidies, and official portal URLs across 66 Central and State schemes.
* **Google Gemini:** Guided system architecture, multi-tool prompt chaining, adversarial validation, bug triage, and Vercel production deployment.
* **Claude:** Performed two-pass security, prompt-injection, and grounding code audits on `core/chatbot.py` and `core/views.py`.
* **Groq API:** Powers real-time multilingual **Sarthi AI** responses (`openai/gpt-oss-120b`) grounded in live database scheme records.

---

## Team and Roles

| Member | Enrolment No. | Role & Contributions |
| :--- | :--- | :--- |
| **Tushar Mital** *(Team Lead)* | `25bcon2455` | System architecture, initial `P0` & Cursor/Antigravity backend setup, Django models/migrations/seed data, State Category & EWS verifier, 66-scheme recommender, Groq Sarthi chatbot, and Vercel deployment |
| **Bhumi** | `25bcon2360` | Frontend and UI/UX design (Bolt.new, Figma, Antigravity), 3-step form & PIN/district UX, scheme-driven `/apply` & `/locator` UI, 23-language localization bundles, and RTL/accessibility testing |
| **Mousam** | `25bcon2411` | Prompt engineering & evaluation (ChatGPT reverse prompting, Perplexity scheme research), Overpass/Esri live bank locator coding, Claude two-pass security audit & hardening, testing, and documentation (`PROMPTS.md`, `README.md`) |

---

## Data & Reference Note

* **Demo Data Disclaimer:** Scheme figures, branch fund quotas, and NPA percentages are prototype reference data modeled on public NSFDC and banking disclosures. Real eligibility, interest rates, and branch availability must be verified on official government portals (`nsfdc.nic.in`, `jansamarth.in`, `pmsuraj.dosje.gov.in`) and with authorized partner banks.
* **Mocked External Services:** DigiLocker document fetch, Bhashini neural translation/TTS, live core-banking quota feeds, and SMS OTP are mocked for academic capstone demonstration.
* **Declared Reference Disclosure:** Our earlier Smart India Hackathon (SIH) prototype (`TusharMital/saksham-setu`) was used strictly as a declared, read-only domain reference; this project was rebuilt cleanly inside `Saksham_Setu` using documented multi-tool AI prompts.