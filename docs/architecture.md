# AI Finance Manager — Architecture

## High-level view

```
                ┌────────────────────────────────────────────┐
   Browser      │            React 18 (Vite) SPA             │
  (en/hi/gu,    │  pages · Recharts · Web Speech API voice   │
   dark/light)  └──────────────┬─────────────────────────────┘
                               │  HTTPS  (JSON, Bearer JWT)
                               ▼
                ┌────────────────────────────────────────────┐
                │        FastAPI application (Uvicorn)       │
                │                                            │
                │  routers/ (13 routers, JWT dependency)     │
                │  services: chat_service · ai_insights ·    │
                │  finance_service · ocr_service ·           │
                │  ocr_service · auth                        │
                │                                            │
                │  ml/  ┌───────────────────────────────┐    │
                │       │ expense_classifier (LR+rules) │    │
                │       │ budget_forecaster (Holt+MAPE) │    │
                │       │ fraud_detector (IsoForest)    │    │
                │       │ health_score (4-factor)       │    │
                │       │ advisor (savings + invest)    │    │
                │       └───────────────────────────────┘    │
                └──────┬───────────────────────┬─────────────┘
                       │                       │
                       ▼                       ▼
             ┌──────────────────┐    ┌────────────────────┐
             │ PyMongo (MongoDB)│    │ Tesseract OCR      │
             │ 10 collections   │    │ (eng + hin, PSM-6) │
             └──────────────────┘    └────────────────────┘
```

## Design decisions

1. **Single deployable.** The built React app is served by FastAPI itself (`StaticFiles` on `/`, API on `/api`). One container, one port, no CORS in production, trivial CI/CD.
2. **Data-grounded AI.** The chatbot, insights, fraud shield and forecasts all read from the user's own ledger. No LLM is *required*: answers are computed templates over real numbers, so the app works fully offline. When `OPENAI_API_KEY` is present, the computed context is sent to the LLM for a natural rewrite (ground truth is never left to the model).
3. **Explainability first.** Fraud alerts carry human-readable reasons (amount vs median, unusual hour, new category). The budget forecast reports its backtested MAPE. The categorizer reports confidence and the method (rule vs model).
4. **Model swap-in paths.** Each ML module exposes a small interface (`predict/check/compute`). DistilBERT, Prophet/LSTM, AutoEncoder and Whisper can be dropped in without touching routers or UI — see `ai-models.md`.
5. **Per-user isolation.** Every ORM query is filtered by the authenticated `user_id`; tokens are short-lived (7 days) and stateless.

## Request lifecycle (example: add an expense)

```
POST /api/expenses {"description":"Swiggy dinner","amount":640,"date":"2026-09-23"}
  1. JWT dependency → user
  2. category omitted → ml.expense_classifier.predict("Swiggy dinner")
       layer 1: merchant rules → "Food" (96%)
  3. fraud gate: ml.fraud_detector.check_transaction(history, 640, "Food")
       IsolationForest over last 60 transactions → risk 0.12 → clean
  4. ORM insert (ai_categorized=True) → commit
  5. response includes the AI decision so the UI can show "✨ AI: Food"
```

## Scaling notes

- FastAPI is async where it matters (OCR upload is `async`); CPU-bound ML runs in the worker pool (default). For multi-core: `uvicorn --workers N`.
- Move to a MongoDB replica set + object storage (receipts) and put a load balancer in front; JWT stays stateless.
- Fraud forest retraining is cheap (<1 s on 60 rows); cache per user with a 1-day TTL if volume grows.
