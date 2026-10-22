import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar, AreaChart, Area,
} from "recharts";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { inr, compact, catIcon, catColor, shortMonth, today, CATEGORY_META } from "../format.js";

const TONE_BG = {
  warning: "color-mix(in srgb, var(--warning) 12%, transparent)",
  success: "color-mix(in srgb, var(--accent) 12%, transparent)",
  fraud: "color-mix(in srgb, var(--danger) 12%, transparent)",
  info: "color-mix(in srgb, var(--accent-2) 12%, transparent)",
};

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const { push } = useToast();
  const [trend, setTrend] = useState({ period: "M", series: null });
  const [qa, setQa] = useState(null);            // null | "expense" | "income"
  const [form, setForm] = useState({ amount: "", desc: "", category: "", source: "Salary", note: "", date: today() });
  const [saving, setSaving] = useState(false);

  const loadDash = () => api("/api/dashboard").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { loadDash(); }, []);

  useEffect(() => {
    if (trend.period === "M") return;
    api(`/api/dashboard/trends?period=${trend.period}`)
      .then((r) => setTrend((x) => ({ ...x, series: r.series })))
      .catch(() => {});
  }, [trend.period]);

  const TREND_LABELS = { D: "Daily (14 days)", W: "Weekly (8 weeks)", M: "Monthly (8 months)", Y: "Yearly" };

  async function quickAdd(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      if (qa === "expense") {
        const body = { amount: parseFloat(form.amount), description: form.desc || form.category || "Quick add", date: form.date };
        if (form.category) body.category = form.category;   // empty → AI predicts category!
        await api("/api/expenses", { method: "POST", body });
        push(`✅ ${inr(parseFloat(form.amount))} ka expense add ho gaya`, "success");
      } else {
        await api("/api/income", { method: "POST", body: { source: form.source, amount: parseFloat(form.amount), date: form.date, note: form.note } });
        push(`✅ ${inr(parseFloat(form.amount))} ki income add ho gayi`, "success");
      }
      setQa(null); setForm({ amount: "", desc: "", category: "", source: "Salary", note: "", date: today() });
      loadDash();
    } catch (err) { push(err.message, "error"); }
    finally { setSaving(false); }
  }
  if (err) return <div className="card text-center muted">⚠️ {err}</div>;
  if (!d) return <div className="grid place-items-center h-64"><div className="pulse text-3xl">💰</div></div>;

  const hm = d.month;
  const savingsRate = hm.income > 0 ? Math.round((hm.savings / hm.income) * 100) : 0;
  const score = d.health.score;
  const scoreColor = score >= 70 ? "var(--accent)" : score >= 55 ? "var(--warning)" : "var(--danger)";

  const Stat = ({ icon, label, value, sub, tone }) => (
    <div className="card fade-up">
      <div className="flex items-center justify-between">
        <span className="muted text-[12px] font-semibold">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-[22px] font-extrabold mono mt-1.5" style={tone ? { color: tone } : {}}>{value}</div>
      {sub && <div className="muted text-[11.5px] mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold">Namaste, {user.full_name.split(" ")[0]} 👋</h1>
          <p className="muted text-[13px]">Here's your money story — {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setQa("income")}
                  style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", borderColor: "var(--accent)", color: "var(--accent)" }}>
            ＋ Income
          </button>
          <button className="btn" onClick={() => setQa("expense")}
                  style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", borderColor: "var(--danger)", color: "var(--danger)" }}>
            ＋ Expense
          </button>
          <Link to="/chat" className="btn btn-primary">🤖 Ask FinMate AI</Link>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Stat icon="💼" label={t("balance")} value={compact(d.totals.total_income - d.totals.total_expense - d.totals.total_invested)} sub="income − expenses − invested" />
        <Stat icon="💰" label={t("income_m")} value={inr(hm.income)} sub={`invested ${savingsRate}% of income`} tone="var(--accent)" />
        <Stat icon="💸" label={t("expense_m")} value={inr(hm.expense)} sub="so far this month" tone={hm.expense > hm.income ? "var(--danger)" : undefined} />
        <Stat icon="🏦" label={t("savings")} value={inr(d.totals.total_invested)} sub={hm.savings > 0 ? `+${inr(hm.savings)} this month (invest only)` : "grows only when you invest"} tone="var(--accent)" />
        <div className="card fade-up">
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-semibold">{t("health")}</span><span className="text-lg">❤️</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="text-[22px] font-extrabold mono" style={{ color: scoreColor }}>{score}</div>
            <div className="flex-1"><div className="progress"><div style={{ width: `${score}%`, background: scoreColor }} /></div>
              <div className="muted text-[11px] mt-1">{d.health.grade}</div></div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* categories pie */}
        <div className="card fade-up">
          <h3 className="card-title">🧭 {t("categories")} — {hm.label}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.categories} dataKey="amount" nameKey="category" innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}>
                  {d.categories.map((c) => <Cell key={c.category} fill={catColor(c.category)} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [inr(v), n]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
            {d.categories.slice(0, 6).map((c) => (
              <div key={c.category} className="flex items-center gap-1.5 text-[12px]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: catColor(c.category) }} />
                <span className="truncate">{catIcon(c.category)} {c.category}</span>
                <span className="muted ml-auto mono">{c.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* trend with period selector */}
        <div className="card fade-up lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="card-title !mb-0">📈 {t("monthly_trend")}</h3>
            <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-soft)" }}>
              {[["D", "Day"], ["W", "Week"], ["M", "Month"], ["Y", "Year"]].map(([k, lab]) => (
                <button key={k} onClick={() => setTrend({ period: k, series: null })}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold transition ${trend.period === k ? "text-white" : "muted"}`}
                  style={trend.period === k ? { background: "var(--accent-2)" } : {}}>{lab}</button>
              ))}
            </div>
          </div>
          <p className="muted text-[11px] mt-1">{TREND_LABELS[trend.period]}{trend.period !== "M" && !trend.series ? " — loading…" : ""}</p>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={trend.period === "M" ? d.monthly_series : (trend.series || [])} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis tickFormatter={(v) => compact(v).replace("₹", "")} tick={{ fill: "var(--muted)", fontSize: 11 }} width={52} />
                <Tooltip formatter={(v, n) => [inr(v), n]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="income" name="Income" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expense" name="Expense" stroke="var(--danger)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="savings" name="Savings" stroke="var(--accent-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* AI insights */}
        <div className="card fade-up lg:col-span-2">
          <h3 className="card-title">✨ {t("ai_insights")} <span className="badge ml-1" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}>live · from your data</span></h3>
          <div className="grid md:grid-cols-2 gap-2.5">
            {d.ai_insights.map((ins, i) => (
              <div key={i} className="rounded-xl px-3.5 py-3 text-[13px] leading-snug flex gap-2.5"
                   style={{ background: TONE_BG[ins.tone] || TONE_BG.info }}>
                <span className="text-lg">{ins.icon}</span><span>{ins.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* right column: fraud + bills + health */}
        <div className="space-y-4">
          {d.fraud_new > 0 && (
            <Link to="/fraud" className="card fade-up block hover:brightness-110" style={{ borderColor: "var(--danger)" }}>
              <h3 className="card-title" style={{ color: "var(--danger)" }}>🛡️ {t("fraud_alerts")}</h3>
              <div className="flex items-center gap-3">
                <div className="text-3xl">⚠️</div>
                <div>
                  <div className="font-bold text-[14px]">{d.fraud_new} suspicious transaction{d.fraud_new > 1 ? "s" : ""}</div>
                  <div className="muted text-[12px]">Review on the Fraud Shield page →</div>
                </div>
              </div>
            </Link>
          )}
          <div className="card fade-up">
            <h3 className="card-title">📅 {t("upcoming")}</h3>
            {d.upcoming_bills.length === 0 && <div className="muted text-[12.5px]">No recurring bills detected.</div>}
            {d.upcoming_bills.map((b) => (
              <div key={b.name} className="flex items-center justify-between py-1.5 text-[13px]">
                <span>{b.name === "Rent" ? "🏠" : "🏦"} {b.name}</span>
                <span className="muted">{new Date(b.due).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · <b className="text-[var(--text)] mono">{inr(b.approx)}</b></span>
              </div>
            ))}
          </div>
          <div className="card fade-up">
            <h3 className="card-title">❤️ {t("health")} breakdown</h3>
            {d.health.components.map((c) => (
              <div key={c.name} className="mb-2.5">
                <div className="flex justify-between text-[12px] mb-1"><span>{c.name}</span><span className="mono muted">{c.score}/{c.max}</span></div>
                <div className="progress"><div style={{ width: `${(c.score / c.max) * 100}%` }} /></div>
                <div className="muted text-[10.5px] mt-0.5">{c.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* income vs expense bars */}
        <div className="card fade-up">
          <h3 className="card-title">💹 {t("income_expense")}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={d.monthly_series.slice(-6)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis tickFormatter={(v) => compact(v).replace("₹", "")} tick={{ fill: "var(--muted)", fontSize: 11 }} width={52} />
                <Tooltip formatter={(v, n) => [inr(v), n]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="var(--danger)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* investment growth */}
        <div className="card fade-up">
          <h3 className="card-title">📈 {t("investment_growth")}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={d.investment_projection.points.map((p, i) => ({ ...p, label: i === 0 ? "Now" : `Yr ${Math.ceil(p.month / 12)}` }))}>
                <defs>
                  <linearGradient id="grow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 10.5 }} interval={4} />
                <YAxis tickFormatter={(v) => compact(v).replace("₹", "")} tick={{ fill: "var(--muted)", fontSize: 11 }} width={52} />
                <Tooltip formatter={(v) => [inr(v), "Portfolio"]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }} />
                <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} fill="url(#grow)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* recent + budget */}
        <div className="space-y-4">
          <div className="card fade-up">
            <h3 className="card-title">🎯 {t("budget_status")}</h3>
            {d.budgets.length === 0 && <div className="muted text-[12.5px]">No budgets yet — <Link className="underline" to="/budget">set one</Link>.</div>}
            {d.budgets.slice(0, 4).map((b) => (
              <div key={b.id} className="mb-2.5">
                <div className="flex justify-between text-[12px] mb-1">
                  <span>{catIcon(b.category)} {b.category}</span>
                  <span className="mono muted">{inr(b.spent)} / {inr(b.limit)}</span>
                </div>
                <div className="progress">
                  <div style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct > 100 ? "var(--danger)" : b.pct > 85 ? "var(--warning)" : "var(--accent)" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="card fade-up">
            <h3 className="card-title">🧾 {t("recent")}</h3>
            <div className="space-y-2">
              {d.recent_expenses.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-center gap-2.5 text-[13px]">
                  <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: "var(--card-2)" }}>{catIcon(e.category)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{e.description || e.category}</div>
                    <div className="muted text-[11px]">{new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {e.category}</div>
                  </div>
                  <div className="mono font-semibold">−{inr(e.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {qa && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(2,6,18,.62)" }} onClick={() => setQa(null)}>
          <form className="card !p-5 w-full max-w-sm" style={{ background: "var(--card)" }} onClick={(e) => e.stopPropagation()} onSubmit={quickAdd}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="card-title !mb-0">{qa === "expense" ? "💸 Quick Expense" : "💰 Quick Income"}</h3>
              <button type="button" className="muted text-lg leading-none" onClick={() => setQa(null)}>✕</button>
            </div>
            <div className="space-y-3">
              {qa === "expense" ? (
                <>
                  <div><label className="label">Amount (₹)</label>
                    <input className="input mono" type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="450" required autoFocus /></div>
                  <div><label className="label">Kis cheez par?</label>
                    <input className="input" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Swiggy lunch, Ola ride…" /></div>
                  <div><label className="label">Category — khali chhodo to 🤖 AI khud laga dega</label>
                    <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="">🤖 AI auto-detect</option>
                      {Object.keys(CATEGORY_META).map((c) => <option key={c} value={c}>{catIcon(c)} {c}</option>)}
                    </select></div>
                </>
              ) : (
                <>
                  <div><label className="label">Amount (₹)</label>
                    <input className="input mono" type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="25000" required autoFocus /></div>
                  <div><label className="label">Source</label>
                    <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                      {["Salary", "Freelance", "Internship", "Business", "Interest", "Gift", "Other"].map((s) => <option key={s}>{s}</option>)}
                    </select></div>
                  <div><label className="label">Note (optional)</label>
                    <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="September salary" /></div>
                </>
              )}
              <div><label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
              <button className="btn btn-primary w-full !py-2.5" disabled={saving}>{saving ? "Saving…" : qa === "expense" ? "Add Expense →" : "Add Income →"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
