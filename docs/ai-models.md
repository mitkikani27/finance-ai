# AI/ML Design Notes

## 1. Expense Categorization (Module 4)

**Pipeline:** `merchant rules → CountVectorizer(binary, 1-2 grams) → LogisticRegression(C=4, balanced)`.

- **Layer 1 — rules:** a curated dictionary of ~120 Indian merchants/keywords (Swiggy, Zomato, BigBasket, DMart, Indian Oil, Jio, HDFC EMI, IRCTC, Netflix…). Deterministic, instant, 96% reported confidence.
- **Layer 2 — model:** trained at boot on a ~200-example corpus of Indian commerce text spanning the 15 categories. Bigrams + binary counting keeps it fast and explainable.
- **Why not straight to BERT?** For a final-year deployment, the cascade is faster, transparent and needs no GPU. The interface (`predict(text) → {category, confidence, alternatives, method}`) is identical to a fine-tuned DistilBERT, so swapping is a one-file change.
- **Measured (demo corpus):** known brands 100% via rules; unknown free text via LR (confidence shown honestly, e.g. 12–37% when text is vague — the UI lets the user override).

## 2. Budget Prediction (Module 5)

**Model:** Holt's Linear Trend (double exponential smoothing), α=0.65, β=0.25, horizon=1.

- Forecast `f = level + trend`; interval `f ± 1.28σ` where σ is the one-step-ahead residual std.
- **Backtest honesty:** a rolling 1-step backtest computes **MAPE**; the API returns it and the UI shows "Model accuracy 98% (MAPE 1.8%)" on the demo data. Confidence label: high < 15%, medium < 30%, else low.
- Per-category forecast: 3-month moving average (transparent, easy to explain in a viva).
- **Swap-in:** Prophet (for yearly seasonality once 12+ months exist) or a small LSTM; `predict_month(values)` is the only function the router calls.

## 3. Fraud Detection (Module 8)

**Model:** scikit-learn **IsolationForest** (n_estimators=150, contamination=0.05), fit on the user's last ≤120 transactions.

- **Features:** `[log1p(amount), hour, weekday, weekend_flag, category_code]` — captures amount anomalies, odd-hour patterns and category novelty.
- **Verdict:** `score_samples` vs the fitted `offset_`; risk mapped `0.5 − 2·(score − offset)` clipped to 0..1; suspicious if the model predicts anomaly or risk > 0.65.
- **Explainability:** reasons are generated from the user's own stats — "Amount is 58× your typical transaction (median ₹850)", "Transaction at 01:37 AM — unusual time", "new category recently".
- **New-user fallback:** robust z-score on log-amounts until 12+ history rows exist.
- **Swap-in:** One-Class SVM or an AutoEncoder (same `check_transaction()` signature).

## 4. Financial Health Score (advanced)

Weighted composite (0–100): Savings rate 40 · Debt-to-income 20 · Emergency-fund months 20 · Budget adherence 20. Graded Excellent/Good/Fair/Needs-Attention with the weakest component driving the top tip.

## 5. Saving & Investment Advisor (Modules 6–7)

- **Benchmarks:** typical monthly category spends for student / employee / family / business profiles (metropolitan India). Any category above benchmark → "cut 40% of the excess" suggestion; potential savings is summed.
- **Allocation:** emergency fund gap filled first (capped at 40% of investable surplus), then a risk-profile matrix (conservative/balanced/aggressive) across FD, debt funds, index/mid-cap SIPs, gold (SGB/ETF), PPF/ELSS, international index.
- **Projection:** monthly SIP future value `P·((1+i)^n − 1)/i` at the portfolio-weighted return — shown as a 10-year chart.
- Always ships with the educational disclaimer.

## 6. Chatbot / Voice (Modules 9, 12)

- **Browser:** Web Speech API — `SpeechRecognition` (en-IN / hi-IN / gu-IN) for STT, `speechSynthesis` for TTS.
- **Server brain:** intent regexes over the normalized question → answers are **computed from the ledger** (spend by period/category, income, savings, budget stats, Holt forecast, fraud count, health score, benchmark tips). No numbers are invented.
- **Optional LLM:** if `OPENAI_API_KEY` is set, the computed context + draft answer are sent to the LLM strictly to *rewrite* the language (system prompt forbids new numbers).

## 7. OCR (Module 10)

Tesseract 5 (eng + hin), grayscale + 2× upscale for small receipts, PSM 6. Regexes: grand `TOTAL` (word-bounded to avoid "Subtotal"), ₹/Rs amounts, date formats, CGST/SGST/IGST tax lines; shop = first alphabetic line. AI categorizer then predicts the category from the shop name.

## 8. Bank SMS Parser (Module 3)

Order-independent regexes for debit/credit forms (HDFC "debited with Rs.", "DR.", "withdrawal of", UPI "payment of … to", "you received … from", salary credits), amount extraction with ₹/Rs prefixes, counterparty via explicit fields (at/to/by/from/payee/merchant/reference) with a noise-word filter, plus an uppercase-run fallback for UPI payee names; UTR/REF captured for audit.


## Module 13 — Market Momentum AI (explainable scoring)

Universe: 40 popular NSE stocks × 9 sectors + 3 indices (yfinance, 6-mo daily candles, disk cache 10 min).

Per stock features: day %, 5-day %, 1-month %, price vs 50-DMA %, volume ratio (yesterday/20-day avg), 20-day volatility.

Composite AI score (0–100):
`35·tanh(mom5d/3) + 30·tanh(mom1m/10) + 25·tanh(trend/8) + 10·tanh((volRatio−1)·2) − 15·tanh(vol20/2)` → normalised.

Verdict mapping: ≥65 Strong · 45–64 Neutral · <45 Weak. Every pick returns its top reasons
(momentum, trend above/below 50-DMA, volume surge, volatility risk) — fully explainable.
Sector view = mean day-change of sector members; mood = advancers vs decliners ratio.
Upgrade path: replace heuristic weights with a trained LightGBM ranker on forward returns.

Live refresh: indices re-fetched every 60s (intraday 1-min candle sparkline, 75 pts);
Market page auto-polls every 30s (LIVE toggle). Chatbot resolves stock aliases
("reliance", "sbi", "nifty"…) → per-stock live answer with score + reasons.
Upgrade path for tick-by-tick: broker WebSocket (Angel One SmartAPI / Upstox — free with account).

## Chatbot v2 — Smart Advisor (data-grounded, ChatGPT-style)

Open questions ("aaj kema invest karva jevo che?", "what should I invest in?") route to
`smart_advice()`: builds a personal answer from the user's real ledger —
snapshot (income/expense/savings rate, negative-month warning + fraud cross-ref) →
emergency-fund gap (6× avg expense vs net balance) → monthly allocation in actual ₹
by risk profile (conservative/balanced/aggressive) → live market context (mood, indices,
strongest sector) → age-based horizon → SEBI disclaimer. Optional `_llm_rewrite` polish
via OPENAI_API_KEY/GEMINI_API_KEY. Unknown questions fall back to a personalized
executive summary + example questions instead of a generic reply.

## Chatbot v3 — Hinglish NLU + Mutual Fund intelligence

Hinglish intents (voice-friendly): kharch/kharcha/kitna (spend), kamai/kamaya (income),
bachat/bachaya (savings), is mahine/pichhle mahine/saal/hafta (periods).

Fund intelligence: 11 real NSE-listed ETFs (Nifty 50/Next 50/Midcap 150, Bank, IT, PSU,
Gold, Silver, Liquid, Nasdaq 100, FANG+) — live 1M/6M/1Y returns via Yahoo Finance,
verdicts (Great >20% / Good >8% / Flat / Negative), sorted by 1Y. Endpoint `/market/funds`,
Market page "💰 Funds" tab, chatbot intent "best mutual fund" etc.
