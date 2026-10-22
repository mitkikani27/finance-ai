# Database Schema (10 MongoDB collections)

Database: **MongoDB** (`finmate`) — local `mongod` ya MongoDB Atlas; bina `MONGO_URI` ke app
in-memory Mongo (mongomock) par chalti hai. Client: PyMongo (`backend/database.py`).
Documents use integer `_`-free `id` fields (per-collection counters) and ISO date strings,
so the data reads exactly like the API responses in Compass/Atlas.
All user-owned collections carry `user_id → users.id` (row-level isolation).

## users
| Column | Type | Notes |
|---|---|---|
| id | PK | |
| email | UNIQUE, INDEX | login |
| full_name | str | |
| phone | str | OTP login key |
| password_hash | str | bcrypt (null for Google/OTP-only accounts) |
| profile | JSON(text) | `{age, occupation, city, risk_profile, income_type, language}` — drives AI benchmarks |
| created_at | ts | |

## income
`id · user_id · source (Salary/Freelance/Rental/Business/…) · amount · date · note · created_at`

## expenses
`id · user_id · category (15 values) · description · amount · date · payment_mode (UPI/Card/Cash/NetBanking/Cheque) · ai_categorized (bool — set when ML assigned the category) · created_at`

## budgets
`id · user_id · category · monthly_limit · created_at` (one per user+category)

## investments
`id · user_id · name · inv_type (FD/Mutual Fund/SIP/Gold/PPF/NPS/Equity/Bond/Emergency Fund) · amount · monthly_inflow (SIP) · expected_return (annual % assumption) · start_date · note · created_at`

## fraud_alerts
`id · user_id · expense_id? · description · amount · risk_score (0..1) · reason (text — explainable AI) · status (new/genuine/fraud) · created_at`

## notifications
`id · user_id · title · body · ntype (info/warning/success/fraud) · read · created_at`

## chat_history
`id · user_id · role (user/assistant) · content · created_at`

## ocr_receipts
`id · user_id · filename · shop · amount · tax · rdate · raw_text (preview) · expense_id? (after confirm) · created_at`

## goals
`id · user_id · name · target_amount · saved_amount · deadline? · created_at`

## Indexes (created at startup — `models.ensure_indexes()`)
`users.email` (unique), `expenses(user_id, date desc)`, `income(user_id, date desc)`, `chat_history(user_id, id desc)`.

## Counters
`counters` collection: one document per collection (`{_id: "expenses", seq: N}`) —
`find_one_and_update($inc)` issues the next integer id (atomic).

## Sample seed
`backend/seed.py` creates `demo@finmate.in` with Apr–Sep 2026: salary ₹48k/mo, rent ₹12k, EMI ₹6.5k, ~₹25–30k variable spend with a mild upward trend, a **₹49,999 late-night UPI fraud case**, 5 budgets, 4 investments (incl. ₹1.2L emergency fund), 2 goals, notifications.
