import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, catIcon, catColor } from "../format.js";

export default function Budget() {
  const { push } = useToast();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mailing, setMailing] = useState(false);
  const [form, setForm] = useState({ category: "Food", monthly_limit: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = () => api("/api/budget").then(setData).catch((e) => push(e.message, "error"));
  useEffect(() => { load(); }, []);

  async function predict() {
    setBusy(true);
    try { setForecast(await api("/api/budget/predict", { method: "POST", body: {} })); }
    catch (e) { push(e.message, "error"); }
    finally { setBusy(false); }
  }
  async function add(e) {
    e.preventDefault();
    try {
      await api("/api/budget", { method: "POST", body: { category: form.category, monthly_limit: parseFloat(form.monthly_limit) } });
      push("Budget saved", "success"); setForm({ ...form, monthly_limit: "" }); load();
    } catch (err) { push(err.message, "error"); }
  }
  async function del(id) {
    await api(`/api/budget/${id}`, { method: "DELETE" }).catch((e) => push(e.message, "error"));
    load();
  }
  async function emailAlert() {
    setMailing(true);
    try {
      const res = await api("/api/email/budget-alert", { method: "POST" });
      push(res.mode === "smtp" ? `Budget alert emailed to ${res.to}` : `Alert ready (preview saved). ${res.message || ""}`, "success");
    } catch (e) { push(e.message, "error"); }
    finally { setMailing(false); }
  }

  if (!data) return <div className="grid place-items-center h-64"><div className="pulse text-3xl">🎯</div></div>;

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-[22px] font-extrabold">🎯 {t("budget")}</h1>
        <p className="muted text-[13px]">Monthly limits per category + AI forecast of next month's spend</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* current budgets */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="card-title !mb-0">🎯 This month's budgets</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[12.5px] muted">
                  Spent <b className="text-[var(--text)] mono">{inr(data.total_spent)}</b> of <b className="text-[var(--text)] mono">{inr(data.total_limit)}</b>
                  <span className="badge ml-2" style={{
                    background: data.overall_pct > 100 ? "color-mix(in srgb, var(--danger) 15%, transparent)" : "color-mix(in srgb, var(--accent) 15%, transparent)",
                    color: data.overall_pct > 100 ? "var(--danger)" : "var(--accent)" }}>
                    {data.overall_pct}% used</span>
                </div>
                <button className="btn btn-sm" onClick={emailAlert} disabled={mailing || !data.total_limit}>
                  {mailing ? "Sending…" : "✉️ Email alert"}
                </button>
              </div>
            </div>
            {data.budgets.length === 0 && <div className="muted text-[13px]">No budgets yet — add your first one below. 🧘</div>}
            {data.budgets.map((b) => (
              <div key={b.id} className="mb-3.5">
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="font-medium">{catIcon(b.category)} {b.category}</span>
                  <span className="mono muted">{inr(b.spent)} / {inr(b.limit)} {b.remaining < 0 ? <b style={{ color: "var(--danger)" }}>· {inr(-b.remaining)} over!</b> : <span>· {inr(b.remaining)} left</span>}</span>
                </div>
                <div className="progress">
                  <div style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct > 100 ? "var(--danger)" : b.pct > 85 ? "var(--warning)" : "var(--accent)" }} />
                </div>
              </div>
            ))}
            <form onSubmit={add} className="flex flex-wrap gap-2 pt-2 border-t mt-2" style={{ borderColor: "var(--border)" }}>
              <select className="input !w-40" value={form.category} onChange={set("category")}>
                {["Food","Groceries","Fuel","Rent","EMI","Medical","Transport","Entertainment","Shopping","Utilities","Education","Travel"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="input !w-36 mono" type="number" min="0" placeholder="₹ limit / month" value={form.monthly_limit} onChange={set("monthly_limit")} required />
              <button className="btn btn-primary btn-sm">＋ Save</button>
            </form>
          </div>

          {/* AI forecast */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="card-title !mb-0">🔮 AI budget prediction (Holt's Linear Trend)</h3>
              <button className="btn btn-sm" onClick={predict} disabled={busy}>{busy ? "Predicting…" : "🤖 Run AI forecast"}</button>
            </div>
            {!forecast && <div className="muted text-[13px]">The model uses your last full months of spending (trend + seasonality) and reports its backtested accuracy (MAPE). Click to forecast next month.</div>}
            {forecast && (
              <div className="fade-up">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-xl p-3 text-center" style={{ background: "var(--card-2)" }}>
                    <div className="muted text-[11px] font-semibold">NEXT MONTH FORECAST</div>
                    <div className="text-[20px] font-extrabold mono mt-1" style={{ color: "var(--accent)" }}>{inr(forecast.forecast)}</div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: "var(--card-2)" }}>
                    <div className="muted text-[11px] font-semibold">EXPECTED RANGE</div>
                    <div className="text-[14px] font-bold mono mt-1.5">{inr(forecast.lower)} – {inr(forecast.upper)}</div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: "var(--card-2)" }}>
                    <div className="muted text-[11px] font-semibold">TREND</div>
                    <div className="text-[14px] font-bold mt-1.5">{forecast.direction} <span className="mono">({forecast.trend_pct > 0 ? "+" : ""}{forecast.trend_pct}%)</span></div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: "var(--card-2)" }}>
                    <div className="muted text-[11px] font-semibold">MODEL ACCURACY</div>
                    <div className="text-[14px] font-bold mt-1.5">{forecast.mape != null ? `${100 - forecast.mape}% <span className="muted text-[11px]">(MAPE {forecast.mape}%)</span>` : "warming up…"}</div>
                  </div>
                </div>
                <div className="rounded-xl p-3 text-[13px]" style={{ background: "color-mix(in srgb, var(--accent-2) 10%, transparent)" }}>
                  📊 {forecast.message} <span className="muted">Data points: {forecast.data_points} months · confidence: {forecast.confidence}.</span>
                </div>
                {forecast.by_category?.length > 0 && (
                  <>
                    <h4 className="card-title mt-4">Per-category expectation (3-month average)</h4>
                    <div className="flex flex-wrap gap-2">
                      {forecast.by_category.map((c) => (
                        <span key={c.category} className="badge" style={{ background: `color-mix(in srgb, ${catColor(c.category)} 14%, transparent)`, color: catColor(c.category) }}>
                          {catIcon(c.category)} {c.category} · {inr(c.forecast)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* smart saving recommendations */}
        <div className="card self-start">
          <h3 className="card-title">💡 Smart saving tips</h3>
          <SavingTips />
        </div>
      </div>
    </div>
  );
}

function SavingTips() {
  const [recs, setRecs] = useState(null);
  useEffect(() => {
    api("/api/chat", { method: "POST", body: { message: "How can I save money?", save_history: false } })
      .then((r) => setRecs(r.reply)).catch(() => setRecs("—"));
  }, []);
  return <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{recs || "Analysing your spending patterns…"}</div>;
}
