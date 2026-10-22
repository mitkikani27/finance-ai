import React, { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, today, currentMonth, monthLabel } from "../format.js";

export default function Income() {
  const { push } = useToast();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState({ source: "Salary", amount: "", date: today(), note: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(() => {
    api(`/api/income?month=${month}`).then(setRows).catch((e) => push(e.message, "error"));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    try {
      await api("/api/income", { method: "POST", body: { ...form, amount: parseFloat(form.amount) } });
      push("Income added", "success");
      setForm({ source: "Salary", amount: "", date: today(), note: "" }); load();
    } catch (err) { push(err.message, "error"); }
  }
  async function del(id) {
    if (!confirm("Delete this income entry?")) return;
    await api(`/api/income/${id}`, { method: "DELETE" }).catch((e) => push(e.message, "error"));
    load();
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4 max-w-[1000px] mx-auto">
      <div>
        <h1 className="text-[22px] font-extrabold">💰 {t("income")}</h1>
        <p className="muted text-[13px]">{monthLabel(month)} · <b className="text-[var(--text)]">{inr(total)}</b> received</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <form onSubmit={add} className="card space-y-3">
          <h3 className="card-title">＋ Add income</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Source</label>
              <select className="input" value={form.source} onChange={set("source")}>
                {["Salary","Freelance","Rental","Business","Interest","Gift","Other"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
            <div><label className="label">Amount (₹)</label>
              <input className="input mono" type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} required /></div>
          </div>
          <div><label className="label">Date</label>
            <input className="input" type="date" value={form.date} onChange={set("date")} max={today()} required /></div>
          <div><label className="label">Note (optional)</label>
            <input className="input" value={form.note} onChange={set("note")} placeholder="e.g. TechSoft Solutions Pvt Ltd" /></div>
          <button className="btn btn-primary w-full">Save Income</button>
        </form>

        <div className="card !p-0 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Source</th><th>Note</th><th className="text-right">Amount</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="muted text-center py-8">No income this month.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                  <td className="font-medium">{r.source}</td>
                  <td className="muted max-w-40 truncate">{r.note || "—"}</td>
                  <td className="text-right mono font-semibold" style={{ color: "var(--accent)" }}>+{inr(r.amount)}</td>
                  <td className="text-right"><button className="btn btn-sm btn-danger" onClick={() => del(r.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
