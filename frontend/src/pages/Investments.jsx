import React, { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "../api.js";
import { Link } from "react-router-dom";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, compact, today } from "../format.js";

export default function Investments() {
  const { push } = useToast();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [proj, setProj] = useState(null);
  const [sug, setSug] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [sip, setSip] = useState("");   // what-if extra SIP (₹/mo) — chart live update
  const [form, setForm] = useState({ name: "", inv_type: "Mutual Fund", amount: "", monthly_inflow: "", expected_return: "12", start_date: today() });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // rows + AI suggestion refetch together after every add/delete
  const load = useCallback(() => {
    api("/api/investments").then(setRows).catch((e) => push(e.message, "error"));
    api("/api/investments/suggest").then(setSug).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // 10-year chart re-projects when what-if SIP OR portfolio rows change
  useEffect(() => {
    const amt = parseFloat(sip);
    const q = amt > 0 ? `&monthly=${amt}` : "";
    const t = setTimeout(() => {
      api(`/api/investments/projection?years=10${q}`).then(setProj).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [sip, rows]);

  async function add(e) {
    e.preventDefault();
    try {
      await api("/api/investments", {
        method: "POST",
        body: { name: form.name, inv_type: form.inv_type, amount: parseFloat(form.amount) || 0,
                 monthly_inflow: parseFloat(form.monthly_inflow) || 0, expected_return: parseFloat(form.expected_return),
                 start_date: form.start_date },
      });
      push("Investment added", "success"); setShowAdd(false);
      setForm({ name: "", inv_type: "Mutual Fund", amount: "", monthly_inflow: "", expected_return: "12", start_date: today() });
      load();
    } catch (err) { push(err.message, "error"); }
  }
  async function del(id) {
    if (!confirm("Remove this investment?")) return;
    await api(`/api/investments/${id}`, { method: "DELETE" }).catch((e) => push(e.message, "error"));
    load();
  }

  const totalValue = rows.reduce((s, r) => s + r.amount, 0);
  const currMonth = new Date().toISOString().substring(0, 7);
  const investedThisMonth = rows.filter(r => r.start_date.substring(0, 7) === currMonth).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4 max-w-[1300px] mx-auto">
      <Link to="/market" className="card !p-3 flex items-center gap-3 text-[13px] font-semibold hover:opacity-90 transition" style={{ borderColor: "var(--accent)" }}>
        🔥 <span>Live Market Trending dekho — aaj konsa stock aur sector chal raha hai (AI insights)</span>
        <span className="muted ml-auto text-[12px]">Open →</span>
      </Link>
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold">📈 {t("investments")}</h1>
          <p className="muted text-[13px]">Portfolio value <b className="text-[var(--text)]">{inr(totalValue)}</b> · {rows.length} instruments</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>＋ Add investment</button>
      </div>

      {/* AI suggestion */}
      {sug && (
        <div className="card fade-up">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="card-title !mb-0">🤖 AI investment suggestion <span className="badge" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}>from your real numbers</span></h3>
            <div className="muted text-[12px]">risk profile: <b className="text-[var(--text)]">{sug.risk_profile}</b></div>
          </div>
          {"investable" in sug ? (
            <div className="grid md:grid-cols-3 gap-3 mb-3">
              <div className="rounded-xl p-3" style={{ background: "var(--card-2)" }}>
                <div className="muted text-[11px] font-semibold">MONTHLY INVESTABLE SURPLUS</div>
                <div className="text-[18px] font-extrabold mono mt-1">{inr(Math.max(0, sug.investable - investedThisMonth))}</div>
                <div className="muted text-[11px]">income − spend − invested · portfolio {inr(totalValue)}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: "var(--card-2)" }}>
                <div className="muted text-[11px] font-semibold">WEIGHTED EXPECTED RETURN</div>
                <div className="text-[18px] font-extrabold mono mt-1">{(sug.weighted_return_pct ?? 0)}%</div>
                <div className="muted text-[11px]">{sug.weighted_return_source === "your portfolio" ? "from your portfolio (amount-weighted)" : "p.a. (assumption, educational)"}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: "var(--card-2)" }}>
                <div className="muted text-[11px] font-semibold">PROJECTED IN 10 YEARS</div>
                <div className="text-[18px] font-extrabold mono mt-1" style={{ color: "var(--accent)" }}>{inr(sug.projected_10y ?? 0)}</div>
                <div className="muted text-[11px]">
                  {sug.weighted_return_source === "your portfolio"
                    ? `from your ₹${(sug.monthly_sip || 0).toLocaleString("en-IN")}/mo SIPs + holdings`
                    : `from ${inr(sug.monthly_sip || 0)}/month suggested SIPs`}
                </div>
              </div>
            </div>
          ) : null}
          {"allocation" in sug ? (
            <>
              <div className="space-y-2">
                {sug.allocation.map((a) => (
                  <div key={a.name} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--card-2)" }}>
                    <div className="flex-1 min-w-40">
                      <div className="font-semibold text-[13.5px]">{a.name}</div>
                      <div className="muted text-[11.5px]">{a.rationale}</div>
                    </div>
                    <div className="mono font-bold text-[14px]">{inr(a.amount)}/mo</div>
                    <span className="badge" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>~{a.expected_return_pct}% p.a.</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11.5px] muted leading-relaxed">⚠️ {sug.disclaimer}</div>
            </>
          ) : (
            <div className="space-y-1.5">{sug.steps?.map((s, i) => <div key={i} className="text-[13px] muted">• {s}</div>)}</div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* portfolio table */}
        <div className="card !p-0 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Instrument</th><th>Type</th><th className="text-right">Value</th><th className="text-right">Inflow/mo</th><th className="text-right">Exp. return</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="muted text-center py-8">No investments yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium max-w-44 truncate">{r.name}</td>
                  <td className="muted">{r.inv_type}</td>
                  <td className="text-right mono">{inr(r.amount)}</td>
                  <td className="text-right mono muted">{r.monthly_inflow ? inr(r.monthly_inflow) : "—"}</td>
                  <td className="text-right mono muted">{r.expected_return}%</td>
                  <td className="text-right"><button className="btn btn-sm btn-danger" onClick={() => del(r.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* growth projection */}
        <div className="card">
          <h3 className="card-title">📈 10-year portfolio growth (monthly SIPs compounding)</h3>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="muted text-[12px] font-semibold">What-if extra SIP ₹/mo:</label>
            <input className="input mono !w-32 !py-1.5" type="number" min="0" placeholder="0"
                   value={sip} onChange={(e) => setSip(e.target.value)} />
            {parseFloat(sip) > 0 && <span className="badge" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>live ⚡ chart updates</span>}
            <span className="muted text-[11px]">amount daalo — projection turant badlegi</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={proj?.points?.map((p, i) => ({ ...p, label: i === 0 ? "Now" : `Yr ${Math.ceil(p.month / 12)}` })) ?? []}>
                <defs>
                  <linearGradient id="inv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-2)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--accent-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis tickFormatter={(v) => compact(v).replace("₹", "")} tick={{ fill: "var(--muted)", fontSize: 11 }} width={52} />
                <Tooltip formatter={(v) => [inr(v), "Portfolio"]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }} />
                <Area type="monotone" dataKey="value" stroke="var(--accent-2)" strokeWidth={2.5} fill="url(#inv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {proj && <div className="muted text-[12px] mt-2">Current value {inr(proj.current_value)} → projected <b className="text-[var(--text)]">{inr(proj.points[proj.points.length - 1]?.value || 0)}</b> in 10 years at expected returns.</div>}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAdd(false)} />
          <div className="card glass relative w-full max-w-md fade-up">
            <h3 className="text-[17px] font-extrabold mb-4">＋ Add investment</h3>
            <form onSubmit={add} className="space-y-3">
              <div><label className="label">Name</label>
                <input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Nifty 50 Index Fund SIP" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Type</label>
                  <select className="input" value={form.inv_type} onChange={set("inv_type")}>
                    {["Mutual Fund","SIP","FD","Gold","PPF","NPS","Equity","Bond","Emergency Fund","Other"].map((x) => <option key={x}>{x}</option>)}
                  </select></div>
                <div><label className="label">Start date</label>
                  <input className="input" type="date" value={form.start_date} onChange={set("start_date")} required /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Value (₹)</label>
                  <input className="input mono" type="number" min="0" value={form.amount} onChange={set("amount")} placeholder="0" required /></div>
                <div><label className="label">SIP (₹/mo)</label>
                  <input className="input mono" type="number" min="0" value={form.monthly_inflow} onChange={set("monthly_inflow")} placeholder="0" /></div>
                <div><label className="label">Exp. % p.a.</label>
                  <input className="input mono" type="number" min="0" step="0.1" value={form.expected_return} onChange={set("expected_return")} /></div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
