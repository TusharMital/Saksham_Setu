## Project name
Saksham Setu (साक्षम सेतु): AI-Powered Scheme and Credit Portal

## Problem statement
Government concessional finance for Scheduled Caste (SC) entrepreneurs, offered through 
NSFDC, is not given directly to citizens. It is routed through 100+ channel partners: 
state channelizing agencies, public sector banks, regional rural banks and NBFC-MFIs.

Applicants face four problems:
1. They don't know which scheme they are eligible for.
2. They don't know which partner can serve them. Applications often reach branches that 
   have used up their fund quota or have high NPAs, so files sit idle.
3. SC lists differ by state (Article 341), so a state-domicile mismatch causes rejections.
4. Rejections come with no explanation, and many applicants turn to informal moneylenders 
   charging 30% or more.

## Purpose
To help applicants find the right scheme, reach a partner that actually has funds, and 
track their application, with every step explained in simple Hindi or English.

## Target audience
Rural and semi-urban SC entrepreneurs and students with low digital literacy, mostly 
using low-end Android phones on slow networks.

## Proposed solution
A full-stack web app with:
- A 3-step smart form with a floating "i" help bubble and voice support (listen and mic)
- A two-layer scheme recommender (hard eligibility filter, then scoring) that gives a 
  plain-language reason for every scheme
- A loan calculator (EMI, interest, moratorium, amortization table)
- A branch locator map with a Health Bar showing fund availability and NPA level
- A document helper that generates a ready-to-submit PDF
- An application status tracker with rejection reasons and what to fix
- Sarthi, a chatbot powered by the Groq API, limited to scheme, loan and eligibility topics

## How it addresses the problem
| Problem | Feature that solves it |
|---|---|
| Doesn't know which scheme fits | Form and two-layer recommender |
| Applications reach branches with no funds | Branch score and Health Bar |
| State-list mismatch | State check in the eligibility filter |
| Rejections with no explanation | Status tracker with reasons and fixes |
| Low digital literacy | Hindi/English, voice help and the Sarthi chatbot |

## Technology
React (Vite), Django REST Framework, SQLite, Leaflet and OpenStreetMap, Groq API, 
ReportLab, deployed on Render.

## AI tools used
- Cursor: first build, backend and chatbot
- Antigravity: frontend, map and tracker
- Claude: prompt critique, code review, testing and documentation

## Team and roles
| Member | Enrolment no. | Role |
|---|---|---|
| Tushar | 25bcon2455 | Team lead, backend, Groq chatbot, deployment (Cursor) |
| Bhumi | 25bcon2360 | Frontend and UI/UX (Antigravity) |
| Mousam | 25bcon2411 | Prompt engineering, evaluation, testing and documentation (Claude) |

## Data note
Scheme figures, fund quotas and NPA values are demo data based on public NSFDC 
information. Real values must be verified with the official NSFDC site and partners. 
DigiLocker, Bhashini, live bank feeds and SMS OTP are mocked.
