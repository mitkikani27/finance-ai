# Deployment Guide

## 1. Local development

```bash
# backend
pip install -r requirements.txt
sudo apt-get install tesseract-ocr tesseract-ocr-hin   # receipt scanner
cd backend && uvicorn main:app --reload --port 8000

# frontend (hot reload)
cd frontend && npm install && npm run dev   # :5173, /api proxied to :8000
```

## 2. Production (single process + MongoDB)

```bash
pip install -r requirements.txt
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
# → serves REST API + built SPA on :8000
```

Set env:

```
FINMATE_SECRET=<long-random>      # JWT secret — mandatory in production
MONGO_URI=mongodb+srv://user:pass@cluster0.xxx.mongodb.net   # MongoDB Atlas (free M0) ya local mongod
MONGO_DB=finmate
CORS_ORIGINS=https://your-domain.com
OPENAI_API_KEY=                    # optional, LLM rewrite of chat answers
```

Without `MONGO_URI` the app runs on an in-memory Mongo (mongomock) — perfect for demos;
with `MONGO_URI` every document persists across restarts and the demo seed loads only once.

## 3. Cloud targets

| Service | How |
|---|---|
| **Render / Railway / Fly.io** | Python web service: build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port 8000` from `backend/`. Create a free **MongoDB Atlas** cluster and set `MONGO_URI`. |
| **Vercel (frontend only)** | `vercel --prod` in `frontend/` (framework Vite); set API base + enable CORS for the Vercel origin; deploy the backend separately (Render). Single-process mode is simpler and recommended. |
| **Heroku / GCP Run / AWS ECS** | same start command; add a MongoDB Atlas add-on / connection string. |

## 4. CI/CD (GitHub Actions) — `deployment/github-actions.yml` (template)

```yaml
on: [push]
jobs:
  test-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt
      - run: python -c "import sys; sys.path.insert(0,'backend'); import main"   # import smoke test
      - run: |
          cd frontend && npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with: { name: app, path: |
            finance-ai/backend
            finance-ai/frontend/dist }
  deploy:
    needs: test-build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/download-artifact@v4
        with: { name: app }
      # example: render deploy CLI / fly deploy / kubectl apply — wire your target
```

## 5. Google OAuth (real, not demo)

The `/api/auth/login/google` demo issues a JWT for a seeded Google-style account. Two production paths:

### 5a. Clerk.com social login (implemented ✅ — recommended)

Clerk (https://clerk.com, free tier) provides the full Google/email sign-in UI and security. The integration is **already coded** — hybrid: without keys the built-in demo login is used, with keys a new **"⚡ Clerk Google"** tab appears on the login page rendering Clerk's `<SignIn/>` card.

**Setup (5 minutes):**
1. Create a free application at clerk.com → Dashboard → **API Keys**.
2. Copy `pk_test_…` and `sk_test_…`.
3. Frontend: put the publishable key in `frontend/.env.local` → `VITE_CLERK_PUBLISHABLE_KEY=pk_test_…` → `npm run build`.
4. Backend: put both keys in `backend/.env`:
   ```
   CLERK_PUBLISHABLE_KEY=pk_test_…
   CLERK_SECRET_KEY=sk_test_…
   ```
5. Clerk Dashboard → **Configure → Sign-in options** → enable **Google**.
6. Restart the server. Sign-ins now create a local user row on first login and receive the same FinMate JWT as every other route (`POST /api/auth/clerk` verifies the Clerk session JWT against Clerk's public JWKS — RS256 — then issues the app token).

**Notes:**
- Third-party cookies are blocked inside sandboxed **iframe previews** — test Clerk on `localhost` or a deployed domain.
- Development instances (`pk_test_`) have usage limits; migrate to `pk_live_` with a custom domain for production.

### 5b. Raw Google OAuth2 (alternative, not installed)

1. Create an OAuth client in Google Cloud Console (redirect = `https://your-domain/api/auth/google/callback`).
2. `pip install authlib google-auth` and exchange the code for the user's email.
3. Look up/create the user and call the existing `create_token()` — nothing else changes.

## 7. Auth transport fallbacks (preview/proxy hardening)

`get_current_user` accepts the JWT from three places, in order:
1. `Authorization: Bearer <token>` header (standard)
2. `finmate_token` cookie
3. `_auth` query parameter (last resort)

Fallbacks 2–3 exist because sandboxed preview iframes block third-party cookies and some
proxies strip the Authorization header. The frontend retries once with `?_auth=` on 401.
For hardened production, restrict to header-only by removing fallbacks 2–3 in `backend/auth.py`.
