import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, today } from "../format.js";

export default function Fraud() {
  const { push } = useToast();
  const { t } = useLang();
  const [alerts, setAlerts] = useState([]);
  const [form, setForm] = useState({ amount: "", description: "", category: "Other", date: today() });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = () => api("/api/fraud/alerts").then(setAlerts).catch((e) => push(e.message, "error"));
  useEffect(() => { load(); }, []);

  async function check(e) {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const r = await api("/api/fraud/check", {
        method: "POST",
        body: { ...form, amount: parseFloat(form.amount), category: form.category, date: form.date },
      });
      setResult(r); load();
      push(r.is_suspicious ? "⚠️ Transaction flagged as suspicious" : "Transaction looks normal", r.is_suspicious ? "error" : "success");
    } catch (err) { push(err.message, "error"); }
    finally { setBusy(false); }
  }

  async function resolve(id, status) {
    await api(`/api/fraud/alerts/${id}/resolve`, { method: "POST", body: { status } }).catch((e) => push(e.message, "error"));
    load();
  }

  const riskColor = (r) => (r > 0.6 ? "var(--danger)" : r > 0.35 ? "var(--warning)" : "var(--accent)");

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-[22px] font-extrabold">🛡️ {t("fraud")}</h1>
        <p className="muted text-[13px]">Isolation Forest anomaly detection trained on <i>your</i> transaction patterns — amount, time-of-day, day & category</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* test a transaction */}
        <div className="lg:col-span-2 space-y-4">
          <form onSubmit={check} className="card space-y-3">
            <h3 className="card-title">🧪 Screen a transaction</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Amount (₹)</label>
                <input className="input mono" type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} placeholder="e.g. 50000" required /></div>
              <div><label className="label">Category</label>
                <select className="input" value={form.category} onChange={set("category")}>
                  {["Food","Groceries","Fuel","Rent","EMI","Medical","Transport","Entertainment","Shopping","Utilities","Education","Travel","Other"].map((c) => <option key={c}>{c}</option>)}
                </select></div>
            </div>
            <div><label className="label">Description</label>
              <input className="input" value={form.description} onChange={set("description")} placeholder="e.g. UPI transfer to unknown number" /></div>
            <div><label className="label">Date</label>
              <input className="input" type="date" value={form.date} onChange={set("date")} /></div>
            <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Analysing…" : "🔍 Run Fraud Check"}</button>
          </form>

          {result && (
            <div className="card fade-up" style={{ borderColor: result.is_suspicious ? "var(--danger)" : "var(--accent)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-3xl">{result.is_suspicious ? "🚨" : "✅"}</div>
                <div>
                  <div className="font-extrabold text-[15px]" style={{ color: riskColor(result.risk_score) }}>
                    {result.is_suspicious ? "SUSPICIOUS TRANSACTION" : "Looks normal"}
                  </div>
                  <div className="muted text-[12px]">{result.model} · risk score {Math.round(result.risk_score * 100)}% · trained on {result.history_size} past transactions</div>
                </div>
              </div>
              <div className="progress mb-3"><div style={{ width: `${result.risk_score * 100}%`, background: riskColor(result.risk_score) }} /></div>
              <ul className="space-y-1.5">
                {result.reasons.map((r, i) => <li key={i} className="text-[13px] flex gap-2"><span>•</span>{r}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* alerts feed */}
        <div className="lg:col-span-3 card !p-0 overflow-x-auto">
          <div className="p-4 pb-0"><h3 className="card-title">🚨 Alert history ({alerts.length})</h3></div>
          {alerts.length === 0 && <div className="muted text-[13px] text-center py-12">No fraud alerts — your account is clean. ✨</div>}
          {alerts.map((a) => (
            <div key={a.id} className="px-4 py-3.5 border-b flex items-start gap-3 relative pr-10" style={{ borderColor: "var(--border)", background: a.status === "new" ? "color-mix(in srgb, var(--danger) 6%, transparent)" : "transparent" }}>
              <div className="text-2xl mt-0.5">{a.status === "new" ? "⚠️" : a.status === "fraud" ? "🚫" : "✅"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[14px]">{a.description}</span>
                  <span className="mono font-extrabold" style={{ color: riskColor(a.risk_score) }}>{inr(a.amount)}</span>
                  <span className="badge" style={{ background: `color-mix(in srgb, ${riskColor(a.risk_score)} 15%, transparent)`, color: riskColor(a.risk_score) }}>
                    risk {Math.round(a.risk_score * 100)}%
                  </span>
                  {a.status !== "new" && <span className="badge" style={{ background: "var(--card-2)", color: "var(--muted)" }}>{a.status}</span>}
                </div>
                <div className="muted text-[12.5px] mt-1">{a.reason}</div>
                <div className="muted text-[11px] mt-1">{a.created_at && new Date(a.created_at + "Z").toLocaleString("en-IN")}</div>
              </div>
              {a.status === "new" && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button className="btn btn-sm" onClick={() => resolve(a.id, "genuine")}>✓ Genuine</button>
                  <button className="btn btn-sm btn-danger" onClick={() => resolve(a.id, "fraud")}>🚫 Mark fraud</button>
                </div>
              )}
              <button 
                className="absolute top-2 right-2 muted hover:text-[var(--danger)] text-xl font-bold px-1"
                title="Delete alert"
                onClick={() => {
                   if (confirm("Delete this alert?")) {
                       api(`/api/fraud/alerts/${a.id}`, { method: "DELETE" }).then(load).catch(e => push(e.message, "error"));
                   }
                }}
              >&times;</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card fade-up">
        <h3 className="card-title">ℹ️ How the AI works</h3>
        <div className="grid md:grid-cols-3 gap-4 text-[13px] leading-relaxed">
          <div><b className="text-[var(--text)]">1. Feature extraction</b><br /><span className="muted">Each transaction is encoded as [log(amount), hour, day-of-week, weekend flag, category code].</span></div>
          <div><b className="text-[var(--text)]">2. Isolation Forest</b><br /><span className="muted">150 trees isolate points; anomalies (short paths) get extreme scores. Retrain-ready per user, contamination 5%.</span></div>
          <div><b className="text-[var(--text)]">3. Explainable verdict</b><br /><span className="muted">Reasons are generated from your own stats — amount vs median, unusual hours, new categories — so you always know <i>why</i>.</span></div>
        </div>
      </div>
    </div>
  );
}
