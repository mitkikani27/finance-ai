import React, { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, today, currentMonth, catIcon, catColor, monthLabel } from "../format.js";

export default function Expenses() {
  const { push } = useToast();
  const { t, lang } = useLang();
  const [rows, setRows] = useState([]);
  const [month, setMonth] = useState(() => new URLSearchParams(window.location.search).get("month") || currentMonth());
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [ai, setAi] = useState(null);           // live AI category suggestion
  const [aiBusy, setAiBusy] = useState(false);
  const timer = useRef(null);
  const [form, setForm] = useState({ description: "", amount: "", date: today(), category: "", payment_mode: "UPI" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(() => {
    const q = new URLSearchParams({ month });
    if (cat) q.set("category", cat);
    if (search) q.set("search", search);
    api(`/api/expenses?${q}`).then(setRows).catch((e) => push(e.message, "error"));
  }, [month, cat, search]);
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); }, [load]);

  // live AI categorization while typing (debounced)
  useEffect(() => {
    clearTimeout(timer.current);
    if (form.description.length < 3) { setAi(null); return; }
    timer.current = setTimeout(async () => {
      setAiBusy(true);
      try { setAi(await api("/api/expenses/predict-category", { method: "POST", body: { description: form.description } })); }
      catch { setAi(null); }
      finally { setAiBusy(false); }
    }, 450);
    return () => clearTimeout(timer.current);
  }, [form.description]);

  async function add(e) {
    e.preventDefault();
    try {
      const r = await api("/api/expenses", {
        method: "POST",
        body: {
          description: form.description, amount: parseFloat(form.amount), date: form.date,
          category: form.category || (ai ? ai.category : null), payment_mode: form.payment_mode,
        },
      });
      push(r.ai_categorized ? `Added & AI-categorized as ${r.category}` : "Expense added", "success");
      setForm({ description: "", amount: "", date: today(), category: "", payment_mode: "UPI" });
      setAi(null); setShowAdd(false); load();
    } catch (err) { push(err.message, "error"); }
  }

  async function del(id) {
    if (!confirm("Delete this expense?")) return;
    try { await api(`/api/expenses/${id}`, { method: "DELETE" }); load(); } catch (err) { push(err.message, "error"); }
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = rows.reduce((a, r) => { a[r.category] = (a[r.category] || 0) + r.amount; return a; }, {});

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold">💸 {t("expenses")}</h1>
          <p className="muted text-[13px]">{monthLabel(month)} · {rows.length} entries · <b className="text-[var(--text)]">{inr(total)}</b> total</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>＋ {t("add_expense")}</button>
      </div>

      {/* filters */}
      <div className="card flex flex-wrap gap-2.5 items-center">
        <input type="month" className="input !w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select className="input !w-44" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {Object.keys(byCat).length === 0 ? null : null}
          {["Food","Groceries","Fuel","Rent","EMI","Medical","Transport","Entertainment","Shopping","Utilities","Education","Travel","Investment","Insurance","Other"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="input flex-1 min-w-40" placeholder="🔍 Search description…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-14 muted">No expenses found for this filter. Add one with the AI auto-categorizer! ✨</div>
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Mode</th><th className="text-right">Amount</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted whitespace-nowrap">{new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                  <td><span className="badge" style={{ background: `color-mix(in srgb, ${catColor(r.category)} 16%, transparent)`, color: catColor(r.category) }}>{catIcon(r.category)} {r.category}{r.ai_categorized && <span title="Categorized by AI"> ✨</span>}</span></td>
                  <td className="max-w-64 truncate">{r.description || "—"}</td>
                  <td className="muted">{r.payment_mode}</td>
                  <td className="text-right">
                    <div className="flex flex-col items-end">
                      <div className="flex items-center justify-end gap-2">
                        {r.receipt_id && (
                          <a href={`/api/ocr/image/${r.receipt_id}?_auth=${encodeURIComponent(localStorage.getItem("finmate_token") || "")}`}
                             target="_blank" rel="noreferrer" title="Receipt image dekho"
                             className="rounded px-1.5 py-0.5 text-[11px]"
                             style={{ background: "var(--bg-soft)", border: "1px solid var(--border)" }}>🧾</a>
                        )}
                        <span className="mono font-semibold">−{inr(r.amount, { decimals: 2 })}</span>
                      </div>
                      {r.original_currency && r.original_currency !== "INR" && r.original_amount && (
                        <span className="text-[10.5px] text-emerald-400 font-mono mt-0.5" title={`Auto-converted at ₹${r.exchange_rate}/unit`}>
                          ({r.original_currency === "USD" ? "$" : r.original_currency === "EUR" ? "€" : r.original_currency === "GBP" ? "£" : ""}{Number(r.original_amount).toFixed(2)} {r.original_currency})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right"><button className="btn btn-sm btn-danger" onClick={() => del(r.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAdd(false)} />
          <div className="card glass relative w-full max-w-md fade-up">
            <h3 className="text-[17px] font-extrabold mb-4">＋ {t("add_expense")}</h3>
            <form onSubmit={add} className="space-y-3.5">
              <div>
                <label className="label">Description / Merchant</label>
                <input className="input" value={form.description} onChange={set("description")} placeholder="e.g. Swiggy order, Indian Oil petrol, Amazon…" autoFocus />
                {aiBusy && <div className="muted text-[11.5px] mt-1.5 pulse">🤖 AI is categorizing…</div>}
                {ai && !aiBusy && (
                  <div className="mt-2 rounded-lg px-3 py-2 text-[12.5px] flex items-center gap-2"
                       style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)" }}>
                    <span className="text-base">{catIcon(ai.category)}</span>
                    <span>AI says <b>{ai.category}</b> ({ai.confidence}%) · <span className="muted">via {ai.method === "merchant-rule" ? "merchant rules" : "Logistic Regression"}</span></span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Amount (₹)</label>
                  <input className="input mono" type="number" step="0.01" min="0" value={form.amount} onChange={set("amount")} placeholder="0" required /></div>
                <div><label className="label">Date</label>
                  <input className="input" type="date" value={form.date} onChange={set("date")} max={today()} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Category (optional — AI fills it)</label>
                  <select className="input" value={form.category} onChange={set("category")}>
                    <option value="">✨ Auto (AI)</option>
                    {["Food","Groceries","Fuel","Rent","EMI","Medical","Transport","Entertainment","Shopping","Utilities","Education","Travel","Investment","Insurance","Other"].map((c) => <option key={c}>{c}</option>)}
                  </select></div>
                <div><label className="label">Payment mode</label>
                  <select className="input" value={form.payment_mode} onChange={set("payment_mode")}>
                    {["UPI","Card","Cash","NetBanking","Cheque"].map((m) => <option key={m}>{m}</option>)}
                  </select></div>
              </div>
              <p className="muted text-[11.5px] leading-relaxed">🛡️ Large or unusual amounts are automatically screened by the Isolation Forest fraud model.</p>
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn btn-primary">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
