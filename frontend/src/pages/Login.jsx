import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { CLERK_PK, ClerkGoogleButton, ClerkAuthWrapper } from "../clerk.jsx";

const FEATURES = [
  ["🤖", "AI Expense Categorization", "Swiggy → Food, Amazon → Shopping — automatically"],
  ["🔮", "Budget Prediction", "Next month's spend forecasted with Holt's trend model"],
  ["🛡️", "Fraud Detection", "Isolation Forest flags suspicious transactions in real time"],
  ["🧾", "Receipt Scanner", "Upload any receipt — OCR extracts shop, date, amount, GST"],
  ["📱", "Bank SMS Reader", "Paste a bank SMS — the entry is made for you"],
  ["🗣️", "Voice + AI Chatbot", "Ask in plain language: “How much did I spend on food?”"],
];

export default function Login() {
  const { login, register, exchangeClerk } = useAuth();
  const { push } = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState("login");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ email: "", password: "", name: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired")) {
      push("Session expire ho gayi — please dobara sign in karein.", "info");
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const go = () => nav("/");

  async function submit(e) {
    e?.preventDefault();
    setBusy(true);
    try {
      if (tab === "login") await login(f.email, f.password);
      else await register({ email: f.email, password: f.password, full_name: f.name });
      go();
    } catch (err) {
      push(err.message, "error");
    } finally { setBusy(false); }
  }

  async function clerkAuthenticated(clerkToken, clerkUser) {
    try { 
      const email = clerkUser?.primaryEmailAddress?.emailAddress || "";
      const name = clerkUser?.fullName || "";
      await exchangeClerk(clerkToken, email, name); 
      go(); 
    }
    catch (err) { push(err.message, "error"); }
  }

  return (
    <ClerkAuthWrapper onAuthenticated={clerkAuthenticated}>
      <div className="login-hero min-h-full flex">
        <div className="hidden lg:flex flex-col justify-center px-14 w-[52%] max-w-3xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-2xl grid place-items-center text-3xl"
                 style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>💰</div>
            <div>
              <div className="text-3xl font-extrabold">FinMate <span style={{ color: "var(--accent)" }}>AI</span></div>
              <div className="muted text-[13px]">AI Finance Manager · Made in India 🇮🇳</div>
            </div>
          </div>
          <h1 className="text-[34px] leading-tight font-extrabold mb-3">
            Your money, understood by <span style={{ color: "var(--accent)" }}>artificial intelligence</span>.
          </h1>
          <p className="muted text-[15px] mb-8 max-w-xl">
            Track expenses, predict budgets, catch fraud, scan receipts, and get personal
            financial advice — all in one professional-grade platform.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map(([ic, title, sub]) => (
              <div key={title} className="card !p-3.5 fade-up">
                <div className="text-xl mb-1">{ic}</div>
                <div className="font-bold text-[13px]">{title}</div>
                <div className="muted text-[11.5px] mt-0.5 leading-snug">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md fade-up">
            <div className="lg:hidden flex items-center gap-2.5 mb-6 justify-center">
              <div className="w-10 h-10 rounded-xl grid place-items-center text-xl"
                   style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>💰</div>
              <div className="text-xl font-extrabold">FinMate AI</div>
            </div>

            <div className="card glass !p-6">
              <div className="flex rounded-xl p-1 mb-5" style={{ background: "var(--bg-soft)" }}>
                <button onClick={() => setTab("login")}
                  className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold transition ${tab === "login" ? "text-white" : "muted"}`}
                  style={tab === "login" ? { background: "var(--accent-2)" } : {}}>Sign In</button>
                <button onClick={() => setTab("register")}
                  className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold transition ${tab === "register" ? "text-white" : "muted"}`}
                  style={tab === "register" ? { background: "var(--accent-2)" } : {}}>Create Account</button>
              </div>

              <form onSubmit={submit} className="space-y-3.5">
                {tab === "register" && (
                  <div><label className="label">Full name</label>
                    <input className="input" value={f.name} onChange={set("name")} placeholder="Aarav Sharma" required /></div>
                )}
                <div><label className="label">Email</label>
                  <input className="input" type="email" value={f.email} onChange={set("email")} placeholder="you@example.com" required /></div>
                <div><label className="label">Password</label>
                  <input className="input" type="password" value={f.password} onChange={set("password")} placeholder="••••••••" required minLength={6} /></div>
                
                <button className="btn btn-primary w-full !py-3 mb-2" disabled={busy}>
                  {busy ? "Please wait…" : tab === "login" ? "Sign In →" : "Create my account →"}
                </button>
              </form>

              {CLERK_PK && (
                <>
                  <div className="flex items-center gap-3 my-4">
                    <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                    <span className="muted text-[11px] font-semibold">OR</span>
                    <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                  </div>
                  <ClerkGoogleButton />
                </>
              )}
            </div>
            <p className="muted text-[11px] text-center mt-4">🔐 JWT-secured · bcrypt passwords</p>
          </div>
        </div>
      </div>
    </ClerkAuthWrapper>
  );
}
