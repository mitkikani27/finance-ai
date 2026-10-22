# 💰 FinMate AI — AI Finance Manager

> **Industry-level personal finance platform with Budget Prediction, Fraud Detection & an AI Financial Assistant — built in India, for India. 🇮🇳**

**Final-Year Project · React 18 + FastAPI + scikit-learn + Tesseract OCR**

FinMate AI solves the everyday money problems of Indian users:

| Problem | FinMate AI's answer |
|---|---|
| Spend money without tracking | One-tap expense entry with **AI auto-categorization** (Swiggy → Food, Amazon → Shopping) |
| Don't know where money goes | Live dashboard, category pie, 8-month trend, CSV reports |
| Miss bill dates | Upcoming-bill detection (Rent / EMI) + notifications |
| Fraud victims | **Isolation Forest** fraud shield — flags unusual amounts, odd hours, new categories |
| Don't know how to save | Smart saving recommendations vs. life-stage benchmarks |
| Don't know how to invest | Profile-based investment plan (FD / MF SIP / Gold / PPF) with 10-year projection |
| Can't read receipts / SMS | **Tesseract OCR** receipt scanner + Indian bank **SMS parser** |
| Want a personal adviser | **Voice + AI chatbot** that answers from *your real ledger* — never hallucinated numbers |

---

## ✨ Features (all 12 modules of the project spec — implemented)

| # | Module | Implementation |
|---|--------|----------------|
| 1 | **User Login** | Email/password (bcrypt) + **JWT** (7-day) + **OTP login** (demo gateway) + **Google login** (OAuth-ready demo) + **⚡ Clerk.com social login** (real Google OAuth — hybrid: activates when keys are configured) |
| 2 | **Expense Tracker** | Full CRUD, 15 categories, filters, search, payment modes |
| 3 | **Bank SMS Reader** | Regex NLP engine for HDFC/SBI/ICICI/Axis/UPI SMS → auto-books expense/income |
| 4 | **AI Expense Categorization** | 2-layer cascade: known-merchant rules (96%) + **Logistic Regression** (CountVectorizer, bigrams) on a curated Indian-merchant corpus |
| 5 | **Budget Prediction** | **Holt's Linear Trend** (double exponential smoothing) + ±1.28σ range + rolling **MAPE backtest** for model accuracy |
| 6 | **Smart Saving Recommendation** | Category benchmarks by life-stage (student / employee / family / business) → concrete cut suggestions |
| 7 | **Investment Suggestion** | Rule-based advisor: emergency-fund-first, risk-profile allocations (conservative/balanced/aggressive), SIP 10-year projection, educational disclaimer |
| 8 | **Fraud Detection** | **IsolationForest** (150 trees, per-user features: log-amount, hour, weekday, weekend, category) + explainable reasons + z-score fallback for new users |
| 9 | **Voice Assistant** | Web Speech API (STT + TTS, en-IN/hi-IN/gu-IN) in the browser + server-side NLU brain (`/api/voice/query`) |
| 10 | **Receipt Scanner** | **Tesseract OCR** (eng + hin) PSM-6 → shop, date, grand total, GST → one-click expense entry |
| 11 | **Dashboard** | Pie (categories), line (trend), bar (income vs expense), area (portfolio growth), budget progress, health score, AI insights |
| 12 | **AI Chatbot** | Data-grounded NLU: spend/income/savings/budget/forecast/fraud/health/tips intents computed from the real ledger; optional LLM rewrite when `OPENAI_API_KEY` is set |
| 11b | **📊 Dashboard Trend Selector** | Day / Week / Month / Year views (`/api/dashboard/trends`) + quick **＋ Expense / ＋ Income** buttons on dashboard |
| 13 | **📈 Live Market + AI Insights** | Real NSE data (Yahoo Finance, no API key): NIFTY/SENSEX/BANKNIFTY, sector heatmap, gainers/losers, **LIVE auto-refresh (30s) + intraday charts**, **AI momentum scoring (0–100, explainable)**, top picks with reasons, chatbot answers "aaj konsa stock achha perform kar raha hai" — educational only |

**Advanced features (bonus, all included):** AI Financial Health Score (0–100, 4 weighted components), bill reminders, **GST calculator**, **currency converter**, **multi-language UI (English / हिंदी / ગુજરાતી)**, **dark + light mode**, goals tracking, notifications, CSV export, seeded demo account.

## 🧠 AI / ML Models

| Feature | Model | Why |
|---|---|---|
| Expense category | Logistic Regression + merchant rules | Fast, explainable, 96% on known brands; swap-in: fine-tuned DistilBERT (same interface) |
| Budget prediction | Holt's Linear Trend | Robust time-series baseline with honest MAPE backtest; swap-in: Prophet / LSTM |
| Fraud detection | Isolation Forest | Unsupervised — learns *your* pattern, no labelled fraud data needed |
| Saving recommendation | Benchmark model (rule-based) | Transparent, industry-standard for advisory UX |
| Investment advice | Allocation model + SIP compounding | Educational, profile-driven, disclaimer-first |
| Chatbot / voice | NLU intents + data templates (+ optional LLM) | Answers are computed, never invented |

Full design notes: [`docs/ai-models.md`](docs/ai-models.md)

## 🛠 Tech Stack

- **Frontend:** React 18, Vite 5, Tailwind CSS 4, Recharts, React Router 6
- **Backend:** FastAPI, PyMongo, PyJWT, bcrypt, Uvicorn  
- **Database:** **MongoDB** — `MONGO_URI` do to wahi chalta hai; warna in-memory Mongo (mongomock) se zero-setup demo  
- **Mobile:** PWA — installable on Android/iPhone home screen, offline app shell, service worker caching
- **AI/ML:** scikit-learn, NumPy, Pandas, Tesseract OCR (pytesseract), Pillow
- **Deployment:** single uvicorn process (API + built frontend), MongoDB storage, GitHub Actions ready
- **API docs:** automatic Swagger UI at `/docs`

## 🚀 Quick Start

### Option A — one command (this workspace's live preview)
The app is already running. Open the preview URL and sign in:

```
Demo account:  demo@finmate.in  /  Demo@123
```

The demo account ships with **6 months of realistic Indian data** (Apr–Sep 2026): salary, rent, EMI, fuel, Swiggy/BigBasket/Amazon, a 6-month emergency fund, SIPs, and **one late-night ₹49,999 UPI transaction that the fraud model has already flagged**.

### Option B — run from source

```bash
# 1. Backend
cd finance-ai
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
sudo apt-get install tesseract-ocr tesseract-ocr-hin   # for the receipt scanner
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000

# 2. Frontend (development mode with hot reload)
cd ../frontend
npm install
npm run dev            # http://localhost:5173  (proxies /api → :8000)

# 3. Or production build (served by FastAPI itself)
npm run build          # → frontend/dist  →  open http://localhost:8000
```

### Option C — MongoDB (data permanently save karne ke liye)

Default mode me data in-memory rehta hai (server restart par demo data dobara seed hota hai).
Permanent storage ke liye MongoDB lagao — bas ek environment variable:

```bash
# Windows par MongoDB install: https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-windows/
# ya free cloud DB: https://www.mongodb.com/cloud/atlas (M0 free forever)
# phir backend/.env me:
MONGO_URI=mongodb://localhost:27017        # local
# MONGO_URI=mongodb+srv://user:pass@cluster0.xxx.mongodb.net   # Atlas
```

Server start karo → `finmate` database khud banega, demo data khud seed hoga, saara data
restart ke baad bhi safe rahega. Pura data MongoDB Compass me dikh sakta hai 🎉

## 📂 Project Structure

```
finance-ai/
├── README.md                  ← you are here
├── requirements.txt
├── .env.example
├── LICENSE
├── docs/
│   ├── architecture.md        ← system design + data flow
│   ├── api.md                 ← full REST API reference
│   ├── database.md            ← 10-collection MongoDB schema
│   ├── ai-models.md           ← ML design, accuracy, swap-in paths
│   └── deployment.md          ← local, MongoDB, Vercel/Render, CI/CD
├── backend/
│   ├── main.py                ← FastAPI app (serves API + built frontend)
│   ├── database.py            ← MongoDB client (PyMongo)
│   ├── models.py              ← 10 Mongo collections + query shim
│   ├── auth.py                ← JWT + bcrypt
│   ├── seed.py                ← demo account with 6 months of data
│   ├── finance_service.py     ← monthly rollups & analytics
│   ├── chat_service.py        ← chatbot/voice NLU brain
│   ├── ai_insights.py         ← dashboard insight generator
│   ├── ocr_service.py         ← Tesseract receipt extraction
│   ├── sms_parser.py          ← Indian bank SMS NLP engine
│   ├── ml/
│   │   ├── expense_classifier.py   ← Module 4 (LR + rules)
│   │   ├── budget_forecaster.py    ← Module 5 (Holt + MAPE)
│   │   ├── fraud_detector.py       ← Module 8 (IsolationForest)
│   │   ├── health_score.py         ← AI Financial Health Score
│   │   └── advisor.py              ← Modules 6+7 (savings & investments)
│   └── routers/               ← auth, expenses, income, budget, fraud,
│                                investments, dashboard, reports, chat,
│                                voice, ocr, sms, goals
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── App.jsx            ← routes + auth guard
│       ├── api.js             ← JWT fetch client
│       ├── i18n.jsx           ← English / हिंदी / ગુજરાતી
│       ├── format.js          ← ₹ en-IN formatting, category meta
│       ├── context/AuthContext.jsx
│       ├── components/        ← Layout (sidebar+topbar+notifications), Toast
│       └── pages/             ← Login, Dashboard, Expenses, Income, Budget,
│                                Fraud, Investments, Reports, Chat, OCR, SMS, Settings
└── deliverables/
    ├── FinMate-AI-Final-Year-Project-Report.docx   ← formal academic report
    └── FinMate-AI-Presentation.pptx                ← defense presentation
```

## 🗄 Database (14 tables)

`users · expenses · income · budgets · investments · fraud_alerts · notifications · chat_history · ocr_receipts · sms_logs · goals` (+ relationships via `user_id` / `expense_id`). Full schema: [`docs/database.md`](docs/database.md)

## 🔌 API (highlights)

Interactive docs at **`/docs`** (Swagger UI). Key endpoints:

```
POST /api/auth/register | /api/auth/login | /api/auth/login/otp/request | /api/auth/login/otp/verify | /api/auth/login/google
GET  /api/dashboard                      → full dashboard payload (stats, charts, AI insights, health)
POST /api/expenses/predict-category      → { "Swiggy order" } → Food 96%
GET  /api/expenses  ·  POST /api/expenses (AI auto-categorizes if category omitted)
POST /api/budget/predict                 → next-month forecast + MAPE + per-category
POST /api/fraud/check                    → Isolation Forest verdict + reasons
GET  /api/investments/suggest            → allocation plan + 10-year projection
POST /api/chat                           → data-grounded financial assistant
POST /api/voice/query                    → same brain, for the voice UI
POST /api/ocr/upload                     → Tesseract receipt extraction
POST /api/sms/parse | /api/sms/add       → Indian bank SMS → structured entry
GET  /api/reports/monthly | /api/reports/export (CSV)
```

## 🧪 Testing highlights (verified end-to-end)

- Login/JWT, register, OTP, Google-demo ✔
- Dashboard aggregation ✔ · AI categorization (5 merchants, 96%) ✔
- Budget forecast: MAPE **1.8%** on the demo history ✔
- Fraud: ₹50,000 late-night → **flagged (risk 56%)**; ₹450 lunch → clean ✔
- Chat: spend / category / forecast / health / saving-tips intents ✔
- SMS: HDFC debit, UPI pay, salary credit, ICICI merchant, SBI DR, PhonePe receive ✔
- OCR: generated receipt → shop `SHREE JEWELS & GROCERS`, total ₹990.16, GST ₹23.58, date 22/09/2026 ✔

## 📈 6-Month Roadmap (as delivered)

| Month | Scope | Status |
|---|---|---|
| 1 | UI/UX, auth, DB design, expense tracker | ✅ |
| 2 | Dashboard, analytics, charts, receipt upload | ✅ |
| 3 | Categorization + budget prediction models | ✅ |
| 4 | Fraud detection, chatbot, voice assistant | ✅ |
| 5 | Testing, optimization, deployment, docs | ✅ |
| 6 | Final report, presentation, demo video | ✅ (report + slides in `deliverables/`) |

## 🔐 Security notes

- Passwords hashed with **bcrypt**; tokens are **JWT (HS256, 7-day expiry)**
- Every query is scoped to the authenticated `user_id` (row-level isolation)
- `.env.example` provided — set `FINMATE_SECRET` in production
- CORS configurable via `CORS_ORIGINS`
- LLM key is **optional** and server-side only — the offline assistant works without it

## ⚖️ Disclaimer

Investment and saving outputs are **educational** and not personalized advice from a SEBI-registered investment adviser. Past performance does not guarantee future results.

## 📄 License

MIT — see [LICENSE](LICENSE). Built as a final-year project in Ahmedabad, India.


## Guides
- 🖥️ VS Code + MongoDB guide: VS_CODE_GUIDE.md
