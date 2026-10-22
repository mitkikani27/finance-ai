# REST API Reference

Base URL: `/api` · Auth: `Authorization: Bearer <JWT>` (all endpoints except `auth/*`)
Interactive: `http://localhost:8000/docs` (Swagger UI) · `openapi.json` at `/openapi.json`

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{email, password, full_name, phone?}` | `{token, user}` |
| POST | `/auth/login` | `{email, password}` | `{token, user}` |
| POST | `/auth/login/google` | — | `{token, user, note}` (demo OAuth) |
| POST | `/auth/clerk` | `{token}` (Clerk session JWT) | `{token, user, provider:"clerk"}` — verifies RS256 via Clerk JWKS; 503 if Clerk not configured |

### 📊 Dashboard trends (period selector)
| GET | `/dashboard/trends?period=D\|W\|M\|Y` | `{period, series:[{label, income, expense, savings}]}` — D=14 days daily · W=8 weeks · M=8 months · Y=calendar years |

### 📈 Market — Live NSE data + AI insights (Module 13, JWT protected)
| Method | Path | Returns |
|---|---|---|
| GET | `/market/overview` | NIFTY/SENSEX/BANKNIFTY live values, sector performance, mood (advancers/decliners) |
| GET | `/market/trending` | Top-5 gainers & losers + full universe (40 NSE stocks) with AI momentum scores |
| GET | `/market/insights` | AI summary: best sector, top-3 momentum picks with reasons, market mood |
| GET | `/market/funds` | 11 NSE ETFs with live 1M/6M/1Y returns + verdicts, sorted by 1Y |
| GET | `/market/stock/{symbol}` | Stock detail: price, day/1M/3M moves, 50DMA trend, volatility, verdict, 30-day sparkline |

Data: Yahoo Finance (yfinance, free — no API key), 10-min disk cache. Educational disclaimer on every response.
| POST | `/auth/login/otp/request` | `{phone}` | `{demo_otp, …}` (demo SMS gateway) |
| POST | `/auth/login/otp/verify` | `{phone, otp}` | `{token, user}` |
| GET | `/auth/me` | — | user profile |
| PUT | `/auth/me` | `{full_name?, phone?, profile?}` | updated profile |
| PUT | `/auth/me/password` | `{old_password, new_password}` | `{ok}` |

## Dashboard

`GET /dashboard` → `{month, totals, categories[], monthly_series[8], budgets[], health{score,grade,components,tips}, investment_projection, recent_expenses[], fraud_new, upcoming_bills[], ai_insights[]}`

## Expenses

| Method | Path | Notes |
|---|---|---|
| GET | `/expenses?month=YYYY-MM&category=&search=&limit=` | filtered list, newest first |
| POST | `/expenses` | `{description, amount, date, category?, payment_mode?}` — **category auto-predicted by AI when omitted**; fraud screen runs automatically |
| POST | `/expenses/predict-category` | `{description}` → `{category, confidence, alternatives, method}` |
| PUT | `/expenses/{id}` | partial update |
| DELETE | `/expenses/{id}` | |

## Income — `GET/POST /income`, `DELETE /income/{id}`

## Budget

| Method | Path | Notes |
|---|---|---|
| GET | `/budget` | budgets + spent + overall % |
| POST | `/budget` | `{category, monthly_limit}` (upsert) |
| DELETE | `/budget/{id}` | |
| POST | `/budget/predict` | Holt forecast: `{forecast, lower, upper, trend_pct, direction, mape, confidence, by_category[], data_points}` |

## Fraud

| Method | Path | Notes |
|---|---|---|
| POST | `/fraud/check` | `{amount, description?, category?, date?}` → `{risk_score, is_suspicious, reasons[], model, history_size, alert_id?}` |
| GET | `/fraud/alerts` | alert history |
| POST | `/fraud/alerts/{id}/resolve` | `{status: genuine|fraud}` |

## Investments

`GET /investments` · `POST /investments` · `DELETE /investments/{id}` ·
`GET /investments/suggest` (AI allocation + 10Y projection) ·
`GET /investments/projection?years=10` (portfolio growth series)

## AI Assistant & Voice

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/chat` | `{message}` | `{reply}` — intents: spend(+category+period), income, savings, budget, forecast, fraud, health, save-money tips, investments, greetings |
| GET | `/chat/history` | — | last 50 messages |
| POST | `/voice/query` | `{text}` | `{reply, speak}` — browser handles STT/TTS |

## OCR Receipts

| Method | Path | Notes |
|---|---|---|
| POST | `/ocr/upload` | multipart `file` (image ≤10 MB) → `{shop, amount, tax, date, ai_category, confidence, raw_text_preview, id}` |
| POST | `/ocr/confirm/{id}` | `{amount, date, category, description}` → books the expense |

## Reports & Goals

`GET /reports/monthly?month=YYYY-MM` · `GET /reports/export?months=6` (CSV) ·
`GET/POST /goals` · `POST /goals/{id}/add-money` · `DELETE /goals/{id}` ·
`GET /goals/notifications`

## Meta

`GET /health` · `GET /meta` (category list)
