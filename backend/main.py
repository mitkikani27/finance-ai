"""FinMate AI — main FastAPI application."""
import jwt
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import auth as authlib
import models

# ── import all working routers ──────────────────────────────────────────────
from routers.auth_router import router as auth_router
from clerk_auth import router as clerk_router
from routers.dashboard import router as dashboard_router
from routers.expenses import router as expenses_router
from routers.income import router as income_router
from routers.budget import router as budget_router
from routers.investments import router as investments_router
from routers.fraud import router as fraud_router
from routers.chat import router as chat_router
from routers.ocr import router as ocr_router
from routers.reports import router as reports_router
from routers.goals import router as goals_router
from routers.market_router import router as market_router
from routers.voice import router as voice_router
from routers.email import router as email_router

app = FastAPI(title="FinMate AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public endpoints — everything else under /api requires a valid JWT
_PUBLIC_EXACT = {
    "/",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/favicon.ico",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/login/google",
    "/api/auth/login/otp/request",
    "/api/auth/login/otp/verify",
    "/api/auth/clerk",
    "/api/health",
    "/api/health/db",
}


@app.middleware("http")
async def lock_api_without_login(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if path in _PUBLIC_EXACT or path.startswith("/docs") or path.startswith("/redoc"):
        return await call_next(request)
    if not path.startswith("/api/"):
        return await call_next(request)

    token = None
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
    if not token:
        token = request.cookies.get("finmate_token")
    if not token:
        token = request.query_params.get("_auth")
    if not token:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    try:
        jwt.decode(token, authlib.SECRET_KEY, algorithms=[authlib.ALGORITHM])
    except jwt.PyJWTError:
        return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)
    return await call_next(request)

# ensure MongoDB indexes on startup
models.ensure_indexes()

# ── register all routers (each has its own /api/... prefix) ─────────────────
app.include_router(auth_router)
app.include_router(clerk_router)
app.include_router(dashboard_router)
app.include_router(expenses_router)
app.include_router(income_router)
app.include_router(budget_router)
app.include_router(investments_router)
app.include_router(fraud_router)
app.include_router(chat_router)
app.include_router(ocr_router)
app.include_router(reports_router)
app.include_router(goals_router)
app.include_router(market_router)
app.include_router(voice_router)
app.include_router(email_router)


@app.get("/")
def read_root():
    return {"message": "Welcome to FinMate AI API"}


@app.get("/api/health")
def api_health():
    import database
    return {"status": "ok", "db_mode": database.mode()}


@app.get("/api/health/db")
def api_health_db():
    import database
    return database.db_info()
