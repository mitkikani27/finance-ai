# 🖥️ VS Code me Run + 🍃 MongoDB Setup — Complete Guide (Hinglish)

> Do hisse hain:
> - **Part A** = VS Code me project chalana (code dekhna/editing/debugging ke saath)
> - **Part B** = MongoDB setup — data permanently save karne ke liye (optional)

---

# PART A — 🖥️ VS Code me kaise run karein

## Step 1 — VS Code install karo (agar nahi hai)
1. https://code.visualstudio.com → **Download for Windows**
2. Install karo (Next → Next → Finish)
3. VS Code kholo → left side **Extensions** icon (4 square wala) → ye install karo:
   - **Python** (Microsoft wala — `ms-python.python`) ⭐ zaroori

## Step 2 — Project kholo
1. Workspace se **`FinMate-AI-Complete.zip`** download → Extract karo (jaise `C:\Projects\FinMate-AI\`)
2. VS Code me: **File → Open Folder** → `FinMate-AI` folder select karo
3. Agar popup aaye "Do you trust the authors?" → **Yes, I trust**

## Step 3 — Terminal kholo + setup (sirf pehli baar)
VS Code me: **Terminal → New Terminal** (ya `Ctrl + ~`)

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

> ✅ **Receipt scanner (OCR)** ke liye ek extra free software — Tesseract:
> Installer yaha se: https://github.com/UB-Mannheim/tesseract/wiki
> Install ke baad ye chalao: `setx TESSDATA_PREFIX "C:\Program Files\Tesseract-OCR\tessdata"` —
> aur Hindi receipt ke liye Hindi language pack tick karo installer me. (Ye skip bhi kar
> sakte ho — baaki saare features bina iske bhi chalenge.)

## Step 4 — Server chalao
```bat
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
Browser: **http://localhost:8000** 🎉

Ya sabse aasan: project root me **`start.bat`** double-click — packages check, build, server sab khud.

## Step 5 — F5 Debug se chalana (pro tip)
`.vscode/launch.json` banao (VS Code: Run → Add Configuration → Python):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "FinMate AI (uvicorn)",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": ["main:app", "--host", "0.0.0.0", "--port", "8000"],
      "cwd": "${workspaceFolder}/backend",
      "jinja": false
    }
  ]
}
```
Ab **F5** → breakpoints lagao, variables dekho, line-by-line debug karo.

## VS Code me kya kya milega (project tour)
```
backend/
  main.py            ← FastAPI app (API + frontend dono serve karta hai)
  database.py        ← MongoDB client (PyMongo)
  models.py          ← 10 collections + query shim
  seed.py            ← demo account + 6 mahine ka perfect data
  routers/           ← saare REST endpoints (expenses, income, budgets, ...)
  chat_service.py    ← AI chatbot (Hinglish samajhta hai)
  market.py          ← live NSE data (yfinance, free)
frontend/
  src/pages/         ← React pages (Dashboard, Expenses, Chat, Market, ...)
  dist/              ← pehle se built frontend (build karne ki zaroorat nahi)
docs/                ← API, database, deployment guides
start.bat            ← 1 double-click = pura app chalu
```

---

# PART B — 🍃 MongoDB Setup (data permanently save karne ke liye)

> **Default me app bina MongoDB ke bhi chalti hai** — in-memory Mongo (mongomock) se.
> Matlab viva/demo ke liye kuch install karne ki zaroorat NAHI.
> Lekin agar chaho ki data **restart ke baad bhi bache** (real app wala feel), to MongoDB lagao:

## Option 1 — Laptop par MongoDB install (recommended for viva)
1. https://www.mongodb.com/try/download/community kholo
2. **Windows x64 → Current version → MSIs** → Download
3. Installer chalao:
   - Setup Type: **Complete**
   - ✅ *Install MongoD as a Service* (ticked rehne do)
   - ✅ *Install MongoDB Compass* (free GUI — data dekhne ke liye mast)
4. Install hone ke baad MongoDB apne aap background me chal jata hai
   (Windows Services me naam: `MongoDB Server`)

Ab project me ek line add karo — `backend\.env` file me:
```
MONGO_URI=mongodb://localhost:27017
```

Server restart karo → done! `finmate` database khud banega, demo data khud seed hoga.

## Option 2 — MongoDB Atlas (free cloud, kuch install nahi)
1. https://www.mongodb.com/cloud/atlas → Sign up (free)
2. **M0 Free cluster** banao (512 MB free forever, no credit card)
3. **Database Access** → user banao (username + password)
4. **Network Access** → `0.0.0.0/0` add karo (Allow anywhere)
5. **Connect → Drivers → Python** → connection string copy karo

`backend\.env` me:
```
MONGO_URI=mongodb+srv://apnauser:apnapass@cluster0.xxxxx.mongodb.net
```
(agar password me `@` ya `/` ho to URL-encode karna — Atlas khud hint deta hai)

## Data dekhna hai? (Compass)
1. **MongoDB Compass** kholo (Option 1 ke saath install hota hai, ya alag download)
2. Connection: `mongodb://localhost:27017` (ya Atlas string)
3. `finmate` database → collections:
   `users · income · expenses · budgets · investments · fraud_alerts · notifications · chat_history · ocr_receipts · goals`

Demo login: **demo@finmate.in / Demo@123** — is user ka pura 6-mahine ka data
Compass me document-by-document dikh sakta hai 🎉

## Viva me DB wale questions (ready answers)
- **"Database kya hai?"** → MongoDB (NoSQL, document-based). Collections = tables, documents = rows.
- **"IDs kaise?"** → Har collection ke liye `counters` document atomic `$inc` se integer id deta hai — API clean integer ids return karta hai.
- **"Indexes?"** → `users.email` unique index (login fast + duplicate block), `expenses(user_id, date)` etc. — startup par `ensure_indexes()` banata hai.
- **"Data kahan save hota hai?"** → `MONGO_URI` diya to local mongod ya Atlas; nahi diya to in-memory (mongomock) — same code, bas ek env variable.

---

## ❓ Common problems

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: pymongo` | `.venv` activate karke `pip install -r requirements.txt` |
| MongoDB se connect nahi, phir bhi app chal rahi hai | Normal hai! App in-memory Mongo par fallback karti hai (console me `MongoDB: in-memory fallback` dikhega) |
| Atlas se connect nahi ho raha | Network Access me `0.0.0.0/0` hai? Password me special chars URL-encoded hain? |
| Port 8000 pehle se use me | `--port 8001` se chalao ya purana terminal band karo |
| Frontend purana dikh raha | `frontend/dist` built hai; changes ke liye `cd frontend && npm install && npm run build` |
