import React, { useEffect, useState, useCallback } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";

const fmt = (n) =>
  n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const Chg = ({ v, suffix = "%" }) => (
  <span className="font-bold" style={{ color: v > 0 ? "var(--success, #10b981)" : v < 0 ? "#ef4444" : "var(--muted)" }}>
    {v > 0 ? "▲" : v < 0 ? "▼" : "•"} {Math.abs(v ?? 0)}{suffix}
  </span>
);

function ScoreChip({ s }) {
  const c = s >= 65 ? "#10b981" : s >= 45 ? "#f59e0b" : "#ef4444";
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}>AI {s}</span>;
}

function StockRow({ s, onOpen }) {
  return (
    <button onClick={() => onOpen(s.symbol)} className="card !p-3 w-full text-left flex items-center gap-3 hover:opacity-90 transition">
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[13.5px] truncate">{s.name} <span className="muted text-[11px]">({s.symbol})</span></div>
        <div className="muted text-[11px]">{s.sector} · 5d {s.mom5d ?? "—"}% · 1m {s.mom1m ?? "—"}%</div>
      </div>
      <div className="text-right">
        <div className="font-bold text-[13.5px]">{fmt(s.price)}</div>
        <div className="text-[12px]"><Chg v={s.day_chg} /></div>
      </div>
      <ScoreChip s={s.score} />
    </button>
  );
}

export default function Market() {
  const { push } = useToast();
  const [tab, setTab] = useState("trending");
  const [ov, setOv] = useState(null);
  const [tr, setTr] = useState(null);
  const [ins, setIns] = useState(null);
  const [fds, setFds] = useState(null);
  const [sym, setSym] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [o, tr2, i, f] = await Promise.all([
        api("/api/market/overview"),
        api("/api/market/trending"),
        api("/api/market/insights"),
        api("/api/market/funds").catch(() => null),
      ]);
      setOv(o); setTr(tr2); setIns(i); setFds(f);
    } catch (e) { push(e.message, "error"); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 🔴 LIVE mode: market data refresh every 30s while tab is open & visible
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30000);
    return () => clearInterval(id);
  }, [live, load]);

  async function openStock(symbol) {
    setSym(symbol); setDetail(null); setTab("search");
    try { setDetail(await api(`/api/market/stock/${symbol}`)); }
    catch (e) { push(e.message, "error"); }
  }

  const TABS = [["trending", "🔥 Trending"], ["funds", "💰 Funds"], ["sectors", "📊 Sectors"], ["ai", "🤖 AI Insights"], ["search", "🔍 Stock"]];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            📈 Live Market <span style={{ color: "var(--accent)" }}>Trending</span>
            <button onClick={() => setLive((v) => !v)}
              className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold tracking-wide"
              style={{ background: live ? "color-mix(in srgb, #ef4444 16%, transparent)" : "var(--bg-soft)",
                       color: live ? "#ef4444" : "var(--muted)", border: `1px solid ${live ? "#ef444455" : "var(--border)"}` }}>
              {live ? "● LIVE 30s" : "○ PAUSED"}
            </button>
          </h1>
          <p className="muted text-[12.5px]">Real NSE data (Yahoo Finance) · indices refresh 60s · AI momentum analysis</p>
        </div>
        <button className="btn btn-sm" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "↻ Refresh now"}</button>
      </div>

      {!ov && busy && <div className="card !p-6 muted text-center">Live market data aa raha hai… (pehli baar ~5 sec)</div>}
      {ov && (
        <>
          {/* index cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {(ov.indices || []).map((i) => {
              const up = (i.chg ?? 0) >= 0;
              const spark = (i.intraday || []).map((v, n) => ({ n, v }));
              return (
                <div key={i.name} className="card !p-4">
                  <div className="flex items-center justify-between">
                    <span className="muted text-[11.5px] font-semibold">{i.name}</span>
                    {live && <span className="text-[9.5px] font-extrabold" style={{ color: "#ef4444" }}>● LIVE</span>}
                  </div>
                  <div className="text-xl font-extrabold mt-0.5">{i.value.toLocaleString("en-IN")}</div>
                  <div className="text-[12.5px] mt-0.5"><Chg v={i.chg} /></div>
                  {spark.length > 1 && (
                    <div className="h-10 mt-1.5">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id={`ig-${i.name.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={up ? "#10b981" : "#ef4444"} stopOpacity={0.45} />
                              <stop offset="100%" stopColor={up ? "#10b981" : "#ef4444"} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Tooltip formatter={(v) => [v.toLocaleString("en-IN"), ""]} contentStyle={{ display: "none" }} />
                          <Area type="monotone" dataKey="v" stroke={up ? "#10b981" : "#ef4444"} strokeWidth={1.6} fill={`url(#ig-${i.name.replace(/\s/g, "")})`} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* mood strip */}
          <div className="card !p-3.5 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-extrabold text-[14px]">Mood: {ov.mood}</span>
            <span className="muted text-[12.5px]">{ov.advancers} advancers · {ov.decliners} decliners</span>
            <span className="muted text-[11.5px] ml-auto">Updated {ov.updated_at}</span>
          </div>

          {/* tabs */}
          <div className="flex rounded-xl p-1 mb-4" style={{ background: "var(--bg-soft)" }}>
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition ${tab === k ? "text-white" : "muted"}`}
                style={tab === k ? { background: "var(--accent-2)" } : {}}>{label}</button>
            ))}
          </div>

          {tab === "trending" && tr && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="card-title" style={{ color: "#10b981" }}>🚀 Top Gainers</h3>
                <div className="space-y-2">{tr.gainers.map((s) => <StockRow key={s.symbol} s={s} onOpen={openStock} />)}</div>
              </div>
              <div>
                <h3 className="card-title" style={{ color: "#ef4444" }}>📉 Top Losers</h3>
                <div className="space-y-2">{tr.losers.map((s) => <StockRow key={s.symbol} s={s} onOpen={openStock} />)}</div>
              </div>
            </div>
          )}

          {tab === "funds" && fds && (
            <div className="space-y-3">
              <div className="card !p-3.5 flex flex-wrap items-center gap-3">
                <span className="font-extrabold text-[14px]">🏆 Best performer: {fds.funds[0].name}</span>
                <span className="muted text-[12.5px]">1Y <b style={{ color: "#10b981" }}>{fds.funds[0].r1y > 0 ? "+" : ""}{fds.funds[0].r1y}%</b> · {fds.funds[0].category}</span>
                <span className="muted text-[11px] ml-auto">{fds.funds.length} live ETFs (NSE)</span>
              </div>
              <div className="card !p-0 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="muted text-left" style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="px-3 py-2.5 font-semibold">#</th>
                      <th className="px-3 py-2.5 font-semibold">Fund / ETF</th>
                      <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Category</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Price</th>
                      <th className="px-3 py-2.5 font-semibold text-right">1M</th>
                      <th className="px-3 py-2.5 font-semibold text-right">6M</th>
                      <th className="px-3 py-2.5 font-semibold text-right">1Y</th>
                      <th className="px-3 py-2.5 font-semibold">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fds.funds.map((f, i) => (
                      <tr key={f.symbol} style={{ borderBottom: "1px solid var(--border)" }} className="hover:opacity-80 transition">
                        <td className="px-3 py-2.5 muted">{i + 1}</td>
                        <td className="px-3 py-2.5 font-bold">{f.name}</td>
                        <td className="px-3 py-2.5 muted hidden sm:table-cell">{f.category}</td>
                        <td className="px-3 py-2.5 text-right mono">{fmt(f.price)}</td>
                        <td className="px-3 py-2.5 text-right"><Chg v={f.r1m} /></td>
                        <td className="px-3 py-2.5 text-right"><Chg v={f.r6m} /></td>
                        <td className="px-3 py-2.5 text-right font-bold"><Chg v={f.r1y} /></td>
                        <td className="px-3 py-2.5"><span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap"
                            style={{ background: f.r1y > 20 ? "#10b98122" : f.r1y > 8 ? "#3b82f622" : f.r1y > 0 ? "#f59e0b22" : "#ef444422",
                                     color: f.r1y > 20 ? "#10b981" : f.r1y > 8 ? "#3b82f6" : f.r1y > 0 ? "#f59e0b" : "#ef4444" }}>{f.verdict}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted text-[11px] rounded-lg p-2.5" style={{ background: "var(--bg-soft)", border: "1px dashed var(--border)" }}>
                ⚠️ {fds.disclaimer}
              </div>
            </div>
          )}
          {tab === "funds" && !fds && <div className="card !p-4 muted text-center">Live fund data aa raha hai… (internet se ~4 sec)</div>}

          {tab === "sectors" && ov && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ov.sectors.map((s) => {
                const c = s.chg > 0 ? "#10b981" : s.chg < 0 ? "#ef4444" : "#94a3b8";
                return (
                  <div key={s.sector} className="card !p-4" style={{ borderColor: `${c}55` }}>
                    <div className="font-bold text-[13px]">{s.sector}</div>
                    <div className="text-lg font-extrabold" style={{ color: c }}>{s.chg > 0 ? "+" : ""}{s.chg}%</div>
                    <div className="muted text-[11px]">{s.count} stocks tracked</div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "ai" && ins && (
            <div className="space-y-4">
              <div className="card !p-4" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent)" }}>
                <h3 className="card-title">🤖 AI ka aaj ka analysis</h3>
                <p className="text-[13.5px] leading-relaxed">{ins.summary}</p>
              </div>
              <div>
                <h3 className="card-title">🏆 Top-3 momentum picks (AI score)</h3>
                <div className="grid md:grid-cols-3 gap-3">
                  {ins.top_picks.map((p, i) => (
                    <div key={p.symbol} className="card !p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[13.5px]">#{i + 1} {p.name}</span>
                        <ScoreChip s={p.score} />
                      </div>
                      <div className="text-[12.5px] mt-1">{fmt(p.price)} · <Chg v={p.day_chg} /></div>
                      <ul className="muted text-[11.5px] mt-2 space-y-1 leading-snug">
                        {p.reasons.map((r, j) => <li key={j}>• {r}</li>)}
                      </ul>
                      <button className="btn btn-sm w-full mt-2.5" onClick={() => openStock(p.symbol)}>Detail dekho →</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "search" && (
            <div className="space-y-4">
              <div className="card !p-4">
                <label className="label">Stock chuno (40 popular NSE stocks)</label>
                <div className="flex gap-2">
                  <select className="input" value={sym} onChange={(e) => openStock(e.target.value)}>
                    <option value="">— select —</option>
                    {(tr?.all || []).map((s) => <option key={s.symbol} value={s.symbol}>{s.name} ({s.symbol})</option>)}
                  </select>
                </div>
              </div>
              {detail && (
                <div className="card !p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-lg font-extrabold">{detail.name} <span className="muted text-[12px]">({detail.symbol} · {detail.sector})</span></div>
                      <div className="text-2xl font-extrabold">{fmt(detail.price)} <span className="text-[13px]"><Chg v={detail.day_chg} /></span></div>
                    </div>
                    <ScoreChip s={detail.score} />
                  </div>
                  <div className="h-44 mt-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={detail.sparkline.map((v, i) => ({ i, v }))}>
                        <defs>
                          <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="i" hide />
                        <YAxis domain={["auto", "auto"]} hide />
                        <Tooltip
                          contentStyle={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                          labelFormatter={() => ""} formatter={(v) => [fmt(v), "Close"]} />
                        <Area type="monotone" dataKey="v" stroke="var(--accent)" fill="url(#spark)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[12px]">
                    <div className="rounded-lg p-2" style={{ background: "var(--bg-soft)" }}>50DMA se <b>{detail.trend_vs_ma50 > 0 ? "+" : ""}{detail.trend_vs_ma50}%</b></div>
                    <div className="rounded-lg p-2" style={{ background: "var(--bg-soft)" }}>1M: <b>{detail.mom1m ?? "—"}%</b></div>
                    <div className="rounded-lg p-2" style={{ background: "var(--bg-soft)" }}>Volatility: <b>{detail.vol20}%</b></div>
                    <div className="rounded-lg p-2" style={{ background: "var(--bg-soft)" }}>Verdict: <b style={{ color: detail.verdict === "Strong" ? "#10b981" : detail.verdict === "Weak" ? "#ef4444" : "#f59e0b" }}>{detail.verdict}</b></div>
                  </div>
                  <ul className="muted text-[12px] mt-2.5 space-y-1">
                    {detail.reasons.map((r, j) => <li key={j}>• {r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="muted text-[11px] mt-5 text-center leading-relaxed rounded-lg p-2.5"
               style={{ background: "var(--bg-soft)", border: "1px dashed var(--border)" }}>
            ⚠️ {ov.disclaimer}
          </div>
        </>
      )}
    </div>
  );
}
