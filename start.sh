#!/usr/bin/env bash
# FinMate AI — one-command start (frontend build + API server on :8000)
set -e
cd "$(dirname "$0")"
if [ ! -d frontend/dist ]; then
  echo "📦 Building frontend…"
  (cd frontend && npm install && npm run build)
fi
echo "🚀 Starting FinMate AI → http://localhost:8000  (demo: demo@finmate.in / Demo@123)"
cd backend && exec python3 -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
