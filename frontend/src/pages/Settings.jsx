import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";

export default function Settings() {
  const { user, refresh, logout } = useAuth();
  const { push } = useToast();
  const { t, lang, setLang } = useLang();
  const nav = useNavigate();
  const [profile, setProfile] = useState({
    full_name: user.full_name, phone: user.phone || "",
    age: user.profile?.age ?? 25, occupation: user.profile?.occupation ?? "employee",
    city: user.profile?.city ?? "Ahmedabad", risk_profile: user.profile?.risk_profile ?? "balanced",
  });
  const [pw, setPw] = useState({ old_password: "", new_password: "" });
  const [mailing, setMailing] = useState(null);
  const set = (k) => (e) => setProfile({ ...profile, [k]: e.target.value });

  async function saveProfile(e) {
    e.preventDefault();
    try {
      await api("/api/auth/me", {
        method: "PUT",
        body: {
          full_name: profile.full_name, phone: profile.phone,
          profile: { ...user.profile, age: +profile.age, occupation: profile.occupation,
                     city: profile.city, risk_profile: profile.risk_profile },
        },
      });
      await refresh();
      push("Profile saved — AI advice now uses your new profile", "success");
    } catch (err) { push(err.message, "error"); }
  }

  async function savePw(e) {
    e.preventDefault();
    try {
      await api("/api/auth/me/password", { method: "PUT", body: pw });
      setPw({ old_password: "", new_password: "" });
      push("Password changed", "success");
    } catch (err) { push(err.message, "error"); }
  }

  return (
    <div className="space-y-4 max-w-[900px] mx-auto">
      <div>
        <h1 className="text-[22px] font-extrabold">⚙️ {t("settings")}</h1>
        <p className="muted text-[13px]">Profile drives the AI: occupation sets benchmarks, risk profile sets the investment plan</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <form onSubmit={saveProfile} className="card space-y-3">
          <h3 className="card-title">👤 Profile</h3>
          <div><label className="label">Full name</label>
            <input className="input" value={profile.full_name} onChange={set("full_name")} required /></div>
          <div><label className="label">Mobile</label>
            <input className="input" value={profile.phone} onChange={set("phone")} placeholder="10-digit number" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Age</label>
              <input className="input mono" type="number" min="16" max="90" value={profile.age} onChange={set("age")} /></div>
            <div><label className="label">City</label>
              <input className="input" value={profile.city} onChange={set("city")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Life stage (spending benchmark)</label>
              <select className="input" value={profile.occupation} onChange={set("occupation")}>
                {["student", "employee", "family", "business"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select></div>
            <div><label className="label">Risk profile (investment AI)</label>
              <select className="input" value={profile.risk_profile} onChange={set("risk_profile")}>
                {["conservative", "balanced", "aggressive"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select></div>
          </div>
          <button className="btn btn-primary w-full">Save profile</button>
        </form>

        <div className="space-y-4">
          <form onSubmit={savePw} className="card space-y-3">
            <h3 className="card-title">🔐 Change password</h3>
            <div><label className="label">Current password</label>
              <input className="input" type="password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} required /></div>
            <div><label className="label">New password</label>
              <input className="input" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required minLength={6} /></div>
            <button className="btn w-full">Update password</button>
          </form>

          <div className="card space-y-3">
            <h3 className="card-title">🌐 Language & account</h3>
            <div className="flex gap-2">
              {[["en", "English"], ["hi", "हिंदी"], ["gu", "ગુજરાતી"]].map(([k, label]) => (
                <button key={k} className="btn btn-sm flex-1" onClick={() => setLang(k)}
                        style={lang === k ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>{label}</button>
              ))}
            </div>
            <div className="muted text-[12px]">Account: <b className="text-[var(--text)]">{user.email}</b></div>
            <button className="btn btn-danger w-full" onClick={async () => { await logout(); nav("/login", { replace: true }); }}>↩ Sign out</button>
          </div>

          <div className="card space-y-3">
            <h3 className="card-title">✉️ Email reports</h3>
            <p className="muted text-[12.5px]">
              Sends to <b className="text-[var(--text)]">{user.email}</b> — monthly summary or a budget-used alert
              (same layout as FinMate Insights emails).
            </p>
            <div className="flex flex-col gap-2">
              <button className="btn w-full" disabled={mailing}
                      onClick={async () => {
                        setMailing("report");
                        try {
                          const res = await api("/api/email/monthly-report", { method: "POST" });
                          push(res.mode === "smtp" ? `Emailed ${res.to}` : (res.message || "Preview saved"), "success");
                        } catch (e) { push(e.message, "error"); }
                        finally { setMailing(null); }
                      }}>{mailing === "report" ? "Sending…" : "Send monthly report"}</button>
              <button className="btn w-full" disabled={mailing}
                      onClick={async () => {
                        setMailing("alert");
                        try {
                          const res = await api("/api/email/budget-alert", { method: "POST" });
                          push(res.mode === "smtp" ? `Emailed ${res.to}` : (res.message || "Preview saved"), "success");
                        } catch (e) { push(e.message, "error"); }
                        finally { setMailing(null); }
                      }}>{mailing === "alert" ? "Sending…" : "Send budget alert"}</button>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">ℹ️ About</h3>
            <div className="muted text-[12.5px] leading-relaxed">
              <b className="text-[var(--text)]">FinMate AI — AI Finance Manager v1.0</b><br />
              React 18 · FastAPI · scikit-learn · Tesseract OCR · SQLite/PostgreSQL<br />
              Industry-level final year project · Made in India 🇮🇳
            </div>
            <div className="muted text-[12px] leading-relaxed mt-3 rounded-lg p-2.5"
                 style={{ background: "var(--bg-soft)", border: "1px dashed var(--border)" }}>
              📱 <b className="text-[var(--text)]">Phone me install karo:</b> Chrome se app kholo →
              menu (⋮) → <b>"Add to Home screen"</b> → FinMate app ki tarah chalega —
              full screen, offline bhi khulta hai!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
