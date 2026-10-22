import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api, getStoredToken } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, monthLabel, currentMonth, catIcon, catColor } from "../format.js";

export default function Reports() {
  const { push } = useToast();
  const { t } = useLang();
  const [month, setMonth] = useState(currentMonth());
  const [r, setR] = useState(null);
  const [gst, setGst] = useState({ amount: "", rate: "18" });
  const [cur, setCur] = useState({ amount: "", from: "USD", to: "INR" });
  const [mailing, setMailing] = useState(false);

  useEffect(() => { api(`/api/reports/monthly?month=${month}`).then(setR).catch((e) => push(e.message, "error")); }, [month]);

  async function emailReport() {
    setMailing(true);
    try {
      const res = await api(`/api/email/monthly-report?month=${month}`, { method: "POST" });
      push(res.mode === "smtp" ? `Monthly report emailed to ${res.to}` : `Report ready (preview saved). ${res.message || ""}`, "success");
    } catch (e) { push(e.message, "error"); }
    finally { setMailing(false); }
  }

  async function exportCsv() {
    const res = await api(`/api/reports/export?months=6`, { raw: true }).catch((e) => push(e.message, "error"));
    if (!res) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `finmate-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    push("CSV report downloaded", "success");
  }

  const RATES = { INR: 1, USD: 83.4, EUR: 90.8, GBP: 104.2, AED: 22.7, SGD: 61.9, AUD: 55.3, JPY: 0.55, CNY: 11.6 };
  const gstCalc = (() => {
    const a = parseFloat(gst.amount) || 0, rate = parseFloat(gst.rate) || 0;
    const excl = a / (1 + rate / 100), tax = a - excl;
    return { excl, tax, rate };
  })();
  const curConvert = (() => {
    const a = parseFloat(cur.amount) || 0;
    return a / RATES[cur.from] * RATES[cur.to];
  })();

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold">📄 {t("reports")}</h1>
          <p className="muted text-[13px]">Monthly statements, CSV export, GST calculator & currency converter</p>
        </div>
        <div className="flex gap-2">
          <input type="month" className="input !w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn" onClick={emailReport} disabled={mailing}>
            {mailing ? "Sending…" : "✉️ Email report"}
          </button>
          <button className="btn" onClick={exportCsv}>⬇️ Export CSV (6 mo)</button>
        </div>
      </div>

      {r && (
        <div className="grid md:grid-cols-4 gap-3">
          <div className="card text-center"><div className="muted text-[11.5px] font-semibold">INCOME</div>
            <div className="text-[20px] font-extrabold mono mt-1" style={{ color: "var(--accent)" }}>{inr(r.income.total)}</div></div>
          <div className="card text-center"><div className="muted text-[11.5px] font-semibold">EXPENSES</div>
            <div className="text-[20px] font-extrabold mono mt-1" style={{ color: "var(--danger)" }}>{inr(r.expense.total)}</div></div>
          <div className="card text-center"><div className="muted text-[11.5px] font-semibold">SAVINGS (INVESTED)</div>
            <div className="text-[20px] font-extrabold mono mt-1">{inr(r.savings)}</div></div>
          <div className="card text-center"><div className="muted text-[11.5px] font-semibold">INVESTED %</div>
            <div className="text-[20px] font-extrabold mono mt-1" style={{ color: r.savings_rate >= 0 ? "var(--accent)" : "var(--danger)" }}>{r.savings_rate}%</div></div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card !p-0 overflow-x-auto">
          <div className="p-4 pb-2"><h3 className="card-title">🧾 {monthLabel(month)} — expense breakdown</h3></div>
          <table className="table">
            <thead><tr><th>Category</th><th className="text-right">Amount</th><th className="text-right">Share</th></tr></thead>
            <tbody>
              {r?.expense.by_category.length === 0 && <tr><td colSpan={3} className="muted text-center py-6">No expenses this month.</td></tr>}
              {r?.expense.by_category.map((c) => (
                <tr key={c.category}>
                  <td><span className="badge" style={{ background: `color-mix(in srgb, ${catColor(c.category)} 15%, transparent)`, color: catColor(c.category) }}>{catIcon(c.category)} {c.category}</span></td>
                  <td className="text-right mono font-semibold">{inr(c.amount)}</td>
                  <td className="text-right muted mono">{c.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {/* GST calculator */}
          <div className="card">
            <h3 className="card-title">🧮 GST calculator (India)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Price inclusive of GST (₹)</label>
                <input className="input mono" type="number" min="0" value={gst.amount} onChange={(e) => setGst({ ...gst, amount: e.target.value })} placeholder="1180" /></div>
              <div><label className="label">GST rate</label>
                <select className="input" value={gst.rate} onChange={(e) => setGst({ ...gst, rate: e.target.value })}>
                  {["0", "5", "12", "18", "28"].map((x) => <option key={x} value={x}>{x}%</option>)}
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-xl p-3" style={{ background: "var(--card-2)" }}>
                <div className="muted text-[11px] font-semibold">BASE VALUE</div>
                <div className="text-[16px] font-bold mono mt-0.5">{inr(gstCalc.excl, { decimals: 2 })}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: "var(--card-2)" }}>
                <div className="muted text-[11px] font-semibold">GST AMOUNT ({gst.rate}%)</div>
                <div className="text-[16px] font-bold mono mt-0.5" style={{ color: "var(--warning)" }}>{inr(gstCalc.tax, { decimals: 2 })}</div>
              </div>
            </div>
          </div>

          {/* currency converter */}
          <div className="card">
            <h3 className="card-title">💱 Currency converter</h3>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
              <div><label className="label">From</label>
                <select className="input" value={cur.from} onChange={(e) => setCur({ ...cur, from: e.target.value })}>
                  {Object.keys(RATES).map((k) => <option key={k}>{k}</option>)}
                </select></div>
              <div className="pb-1 text-xl muted">→</div>
              <div><label className="label">To</label>
                <select className="input" value={cur.to} onChange={(e) => setCur({ ...cur, to: e.target.value })}>
                  {Object.keys(RATES).map((k) => <option key={k}>{k}</option>)}
                </select></div>
            </div>
            <div className="mt-3"><label className="label">Amount in {cur.from}</label>
              <input className="input mono" type="number" value={cur.amount} onChange={(e) => setCur({ ...cur, amount: e.target.value })} placeholder="100" /></div>
            <div className="rounded-xl p-3 mt-3" style={{ background: "color-mix(in srgb, var(--accent-2) 10%, transparent)" }}>
              <div className="muted text-[11px] font-semibold">RESULT</div>
              <div className="text-[19px] font-extrabold mono">{cur.from === "INR" ? "" : ""}{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(curConvert)} <b>{cur.to}</b></div>
              <div className="muted text-[10.5px] mt-1">Indicative rates (static demo table — plug a live FX API in production).</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
