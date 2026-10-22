# 🚀 FinMate AI — Apne Laptop me Setup (Local Guide)

> 🖥️ **VS Code me run karna hai? F5 debug ke saath?** → [`VS_CODE_GUIDE.md`](VS_CODE_GUIDE.md) kholo
> 🍃 **Data MongoDB me permanently save karna hai?** → [`VS_CODE_GUIDE.md`](VS_CODE_GUIDE.md) → Part B

> Simple Hinglish guide — 15 minute me project aapke laptop par chalega.
> **Koi paid API key ki ZAROORAT NAHI hai.** Sab AI features offline chalte hain.

---

## ✅ Kya chahiye / kya nahi chahiye (sabse pehle ye padho)

| Cheez | Zaroorat? | Kab |
|---|---|---|
| Python 3.11+ | ✅ Haan (free) | Backend chalane ke liye |
| Tesseract OCR | ✅ Haan (free) | Sirf Receipt Scanner module ke liye
| Internet | ⭕ Market module ke liye | 📈 Live Market (NIFTY/stocks) real data internet se aata hai (Yahoo Finance — free, koi key nahi). Baaki 12 modules offline bhi chalte hain |
| Node.js | ⭕ Optional | Sirf tab jab frontend ka code khud change karo (maine built version zip me diya hai) |
| Clerk API keys | ⭕ Optional | Sirf real Google login button ke liye (demo login bina keys bhi chalta hai) |
| OpenAI API key | ⭕ Optional | Chatbot ke answers aur smart banane ke liye (bina iske bhi chatbot chalta hai) |
| Internet | ⭕ Optional | Install ke time chahiye, baad me offline bhi chalega |

**Yaani: Python + Tesseract install karo → project chalu. Bas.**

---

## STEP 1 — Python install karo (5 min)

1. Browser me jao: **https://www.python.org/downloads/**
2. Yellow button **"Download Python 3.12"** dabao
3. Downloaded file kholo (e.g. `python-3.12.x-amd64.exe`)
4. ⚠️ **SABSE IMPORTANT:** pehle screen par **"Add python.exe to PATH"** ✅ tick karo
5. Phir **"Install Now"** dabao
6. Check: **Command Prompt** kholo (Start menu → type `cmd`) aur likho:
   ```
   python --version
   ```
   `Python 3.12.x` dikhe to ✅ ho gaya.

## STEP 2 — Tesseract OCR install karo (3 min)

1. Jao: **https://github.com/UB-Mannheim/tesseract/wiki**
2. **"tesseract-ocr-w64-setup-5.x.x.exe"** download karo (64-bit Windows)
3. Install karo — **Next → Next**, ek screen par **"Add to PATH"** type ka option ✅ tick rakhna
4. Ho gaya! (Ye sirf Receipt Scanner ke liye hai — baaki 11 modules iske bina bhi chalte hain)

## STEP 3 — Project laptop me copy karo (2 min)

1. Chat se **`FinMate-AI-Complete.zip`** download karo
2. Zip ko kisi folder me extract karo — jaise `C:\Projects\FinMate-AI\`
   (Right click → **Extract All**)

## STEP 4 — Ek baar setup command chalao (2 min)

Command Prompt kholo aur ye 2 lines type karo (ek-ek karke):

```bat
cd C:\Projects\FinMate-AI
pip install -r requirements.txt
```

(~2-3 min lagega, packages download honge — ek hi baar karna hai)

## STEP 5 — Project START karo 🎉

**Aasaan tareeka:** Project folder me **`start.bat`** par **double-click** karo.
→ Browser khud khulega: `http://localhost:8000`

**Ya manually:**
```bat
cd C:\Projects\FinMate-AI\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
Phir browser me kholo: **http://localhost:8000**

### Login karo:
- **Create Account** tab kholo → apni **real email + password** se account banao
- Ya **Continue with Google** / OTP login use karo
- (Note: `demo@finmate.in` / `Demo@123` wala purana demo data bhi manual login se khul sakta hai — 6 mahine ka sample data isme hai)

**Bas! 12 modules ab aapke laptop par chal rahe hain — ₹ formatting, AI categorization,
fraud detection, budget prediction, chatbot, dashboard — sab offline, sab free.**

---

## 🔑 OPTIONAL — Keys dena ho to kahan dena hai

### (a) Clerk Google login — ✅ PEHLE SE CONFIGURED HAI!
- Keys (`sharp-scorpion-207` app) project ke andar hi set hain:
  `backend\.env` + `frontend\.env.local`
- `start.bat` chalao → Login page par **"⚡ Clerk Google"** tab dikhega
- Uspar dabao → apna real Google account choose karo → dashboard khul jayega
- (Laptop ke `localhost` par ye 100% kaam karta hai. Agar Google option na dikhe
  to clerk.com dashboard → Configure → Sign-in options me **Google** ✅ karo)

### (b) OpenAI key → Chatbot smarter answers ke liye
`backend\.env` me ye line add karo:
```
OPENAI_API_KEY=sk-proj-yahan_apni_key
```
Bina iske chatbot offline NLU se chalta hai (spending history se answers deta hai) —
demo/viva ke liye kaafi hai.

---

## 🛠 Problem aa jaye to (Troubleshooting)

| Problem | Solution |
|---|---|
| `python` command nahi milti | STEP 1 me "Add to PATH" tick karna miss ho gaya → Python dobara install karo, PATH ✅ karke |
| `pip` nahi chalta | `python -m pip install -r requirements.txt` try karo |
| Receipt Scanner error | Tesseract install nahi hua ya PATH miss — STEP 2 dobara dekho. Baaki modules chale rahe honge |
| Port 8000 already in use | `start.bat` do baar chal gaya → purani window band karo |
| Browser me kuch nahi khulta | Server window **kholi rehni chahiye** — usko band karoge to app band |
| Google (Clerk) tab nahi dikh raha | Keys abhi set nahi hui — ye normal hai, demo login se sab kaam chalta hai |
| Frontend ka code change kiya | `cd frontend` → `npm install` → `npm run build` → server restart |

---

## 📱 Kya-kya test karke dekho (demo flow)

1. **Login** → demo account
2. **Dashboard** → charts + AI Health Score + fraud alert (₹49,999 wala) dikhega
3. **Expenses** → "Swiggy" type karo → AI khud **Food** category lagayega
4. **SMS Reader** → sample SMS dabao → entry auto ban jayegi
5. **Receipt Scanner** → koi bhi receipt ka photo/scan upload karo → OCR
6. **Chatbot** → pucho: *"how much did I spend on food?"*
7. **Voice** → 🎤 dabao aur bolo (Chrome me best chalta hai)
8. **Budget** → next month ka AI prediction + accuracy (MAPE 1.8%)
9. **Fraud** → ₹50,000 ka test transaction → ⚠️ Suspicious flag with reasons
10. **Reports** → CSV export

> 💡 **Viva tip:** Ye pura setup offline chalta hai, internet band karke bhi demo de sakte ho
> (sirf Clerk/Google wala button aur optional OpenAI chat ko internet chahiye).


---

## 🗄️ REAL APP ke liye Database (customers ka data kahan save hoga)

Database ab **MongoDB** hai. 2 modes — code 1 line bhi nahi badalna padta:

| Mode | Kab use karo | Kaise |
|---|---|---|
| **In-memory Mongo** (default) | Laptop/demo/viva — zero setup | Kuch mat karo — app khud in-memory MongoDB se chalegi, demo data khud seed hoga (restart par data refresh) |
| **Real MongoDB** | **Real app** — data permanently save, Compass me dikhana | Neeche dekho 👇 |

### MongoDB setup (Windows, 5 minute)
1. **MongoDB Community Server download karo:** https://www.mongodb.com/try/download/community
   (Windows MSI → Next → Next → ✅ "Install MongoDB as a Service" ticked rahe → Install)
2. Bas ho gaya — `mongod` service apne aap start ho jata hai (`mongodb://localhost:27017`).
3. Project folder me `backend\.env` file me ek line daal do:
   ```
   MONGO_URI=mongodb://localhost:27017
   ```
4. `start.bat` chalao → `finmate` database **khud banega**, demo data **khud seed** hoga,
   saara data restart ke baad bhi safe rahega ✅

### Ya free cloud MongoDB (MongoDB Atlas — kuch install nahi karna)
1. https://www.mongodb.com/cloud/atlas → free **M0 cluster** banao (no credit card)
2. **Database Access** me user banao → **Network Access** me `0.0.0.0/0` allow karo
3. **Connect → Drivers →** connection string copy karo, aisa dikhega:
   `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/`
4. `backend\.env` me daal do:
   ```
   MONGO_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net
   ```
5. `start.bat` chalao — cloud DB me collections + demo data khud ban jayenge.
   (Har user ka data alag document, password bcrypt-hashed, JWT-secured — multi-customer safe ✅)

**Data dekhna hai?** MongoDB Compass (free GUI) download karo → connection string paste →
`finmate` database ke 10 collections me pura data dikhega 🎉

> 💡 **Viva line:** "Pura data access PyMongo driver se hota hai — MongoDB me collections
> aur documents hain, per-collection counter se integer IDs milti hain, aur `MONGO_URI`
> badal kar local se Atlas par shift ho jaata hai — raw SQL kahin nahi."

---

## 📱 Mobile me app ki tarah chalana (PWA — already built-in!)

Ye web app **PWA (Progressive Web App)** hai — Play Store ke bina bhi phone me
**app ki tarah install** ho jata hai:

**Android:** Chrome me app kholo (`http://<aapke-laptop-ka-ip>:8000`) → menu (⋮) →
**"Add to Home screen / Install app"** → FinMate icon home screen par ✅

**iPhone:** Safari me kholo → Share button → **"Add to Home Screen"** ✅

- Full-screen khulega (browser ke address bar ke bina)
- **Offline bhi khulta hai** (service worker app shell cache karta hai)
- Icon, splash screen, theme color — sab set hai (`manifest.json` + `sw.js`)

**Phone aur laptop same WiFi par honе chahiye.** Laptop ka IP nikaalo:
`ipconfig` chalao → "IPv4 Address" (jaise `192.168.1.5`) → phone me
`http://192.168.1.5:8000` kholo. (Server already `0.0.0.0` par sunta hai ✅)
