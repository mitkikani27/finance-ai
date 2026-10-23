import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, compact, today } from "../format.js";

// Asset Type styling & metadata
const ASSET_TYPES = {
  "Mutual Fund": { icon: "📈", color: "#3b82f6", defaultReturn: 12 },
  "SIP": { icon: "🔄", color: "#10b981", defaultReturn: 13 },
  "Equity": { icon: "📊", color: "#8b5cf6", defaultReturn: 15 },
  "FD": { icon: "🏦", color: "#f59e0b", defaultReturn: 7.2 },
  "Gold": { icon: "🪙", color: "#eab308", defaultReturn: 9.5 },
  "PPF": { icon: "🛡️", color: "#06b6d4", defaultReturn: 7.1 },
  "NPS": { icon: "👴", color: "#6366f1", defaultReturn: 10 },
  "Bond": { icon: "📜", color: "#64748b", defaultReturn: 8 },
  "Emergency Fund": { icon: "🚨", color: "#ec4899", defaultReturn: 6.5 },
  "Other": { icon: "💼", color: "#94a3b8", defaultReturn: 10 },
};

export default function Investments() {
  const { push } = useToast();
  const { t } = useLang();

  // Holdings & server data
  const [rows, setRows] = useState([]);
  const [proj, setProj] = useState(null);
  const [sug, setSug] = useState(null);
  const [loading, setLoading] = useState(true);

  // Gemini AI Review
  const [aiReview, setAiReview] = useState(null);
  const [loadingAiReview, setLoadingAiReview] = useState(false);

  // Interactive Simulator Controls
  const [sipExtra, setSipExtra] = useState("");
  const [projYears, setProjYears] = useState(10);
  const [customRate, setCustomRate] = useState("12");
  const [executingSip, setExecutingSip] = useState(false);

  // View & Filter states
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("val_desc"); // "val_desc" | "return_desc" | "sip_desc" | "name"
  const [viewMode, setViewMode] = useState("cards"); // "cards" | "table"

  // Modal State (Add / Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    inv_type: "Mutual Fund",
    amount: "",
    monthly_inflow: "",
    expected_return: "12",
    start_date: today(),
    note: "",
  });
  const [savingForm, setSavingForm] = useState(false);

  // Load portfolio holdings & AI suggestions
  const loadPortfolio = useCallback(async () => {
    try {
      const [resRows, resSug] = await Promise.all([
        api("/api/investments"),
        api("/api/investments/suggest").catch(() => null),
      ]);
      setRows(resRows || []);
      setSug(resSug);
    } catch (e) {
      push(e.message || "Failed to load investment portfolio", "error");
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    loadPortfolio();
    loadAiReview();
  }, [loadPortfolio]);

  // Load Gemini AI Portfolio Review
  async function loadAiReview() {
    setLoadingAiReview(true);
    try {
      const res = await api("/api/investments/ai-review", { method: "POST" });
      setAiReview(res.review);
    } catch (e) {
      setAiReview(null);
    } finally {
      setLoadingAiReview(false);
    }
  }

  // Live Wealth Compounding Projection with custom return rate
  useEffect(() => {
    const extraNum = parseFloat(sipExtra) || 0;
    const rateNum = parseFloat(customRate) || 12;
    const timer = setTimeout(() => {
      api(`/api/investments/projection?years=${projYears}&monthly=${extraNum}&rate=${rateNum}`)
        .then(setProj)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [sipExtra, projYears, customRate, rows]);

  // Monthly SIP Auto-Execution: adds into investment amount & deducts from income/balance
  async function executeAutoSip(invId = null) {
    setExecutingSip(true);
    try {
      const res = await api("/api/investments/execute-sip", {
        method: "POST",
        body: invId ? { inv_id: invId, force: true } : { force: false },
      });
      if (res.count > 0) {
        push(`✅ ${res.message}! Added to investment holding and deducted from monthly balance.`, "success");
        loadPortfolio();
      } else {
        push(res.message || "All monthly SIPs are already executed for this month!", "info");
      }
    } catch (e) {
      push(e.message || "SIP execution failed", "error");
    } finally {
      setExecutingSip(false);
    }
  }

  // Open modal for new holding or edit
  function openModal(existing = null) {
    if (existing) {
      setEditingId(existing.id);
      setForm({
        name: existing.name,
        inv_type: existing.inv_type || "Mutual Fund",
        amount: String(existing.amount || 0),
        monthly_inflow: String(existing.monthly_inflow || 0),
        expected_return: String(existing.expected_return || 12),
        start_date: existing.start_date ? existing.start_date.slice(0, 10) : today(),
        note: existing.note || "",
      });
    } else {
      setEditingId(null);
      setForm({
        name: "",
        inv_type: "Mutual Fund",
        amount: "",
        monthly_inflow: "",
        expected_return: "12",
        start_date: today(),
        note: "",
      });
    }
    setModalOpen(true);
  }

  // Handle Save (Add or Update)
  async function handleSave(e) {
    e?.preventDefault();
    if (!form.name.trim()) {
      push("Kripya investment ka naam enter karein.", "error");
      return;
    }

    setSavingForm(true);
    try {
      const payload = {
        name: form.name.trim(),
        inv_type: form.inv_type,
        amount: parseFloat(form.amount) || 0,
        monthly_inflow: parseFloat(form.monthly_inflow) || 0,
        expected_return: parseFloat(form.expected_return) || 12.0,
        start_date: form.start_date || today(),
        note: form.note || "",
      };

      if (editingId) {
        await api(`/api/investments/${editingId}`, { method: "PUT", body: payload });
        push(`✅ '${payload.name}' investment updated!`, "success");
      } else {
        await api("/api/investments", { method: "POST", body: payload });
        push(`✅ '${payload.name}' added to your portfolio!`, "success");
      }

      setModalOpen(false);
      loadPortfolio();
      loadAiReview();
    } catch (err) {
      push(err.message || "Investment save nahi ho paya", "error");
    } finally {
      setSavingForm(false);
    }
  }

  // Delete investment holding
  async function handleDelete(id, name) {
    if (!window.confirm(`Kya aap '${name}' ko portfolio se delete karna chahte hain?`)) return;
    try {
      await api(`/api/investments/${id}`, { method: "DELETE" });
      push(`🗑️ '${name}' removed from portfolio`, "success");
      loadPortfolio();
      loadAiReview();
    } catch (e) {
      push(e.message || "Delete fail ho gaya", "error");
    }
  }

  // Export portfolio CSV
  function exportCSV() {
    if (!rows.length) return;
    const headers = ["Instrument Name", "Type", "Current Value", "Monthly SIP", "Expected Return %", "Start Date", "Notes"];
    const lines = rows.map((r) => [
      `"${r.name}"`,
      r.inv_type,
      r.amount,
      r.monthly_inflow,
      r.expected_return,
      r.start_date,
      `"${r.note || ""}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...lines].map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `portfolio_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    push("📥 Investment portfolio exported as CSV", "success");
  }

  // Portfolio calculations
  const totalValue = useMemo(() => rows.reduce((s, r) => s + (r.amount || 0), 0), [rows]);
  const totalMonthlySip = useMemo(() => rows.reduce((s, r) => s + (r.monthly_inflow || 0), 0), [rows]);

  const weightedReturn = useMemo(() => {
    if (!rows.length) return 0;
    if (totalValue > 0) {
      const sumWeighted = rows.reduce((s, r) => s + (r.amount || 0) * (r.expected_return || 12), 0);
      return Math.round((sumWeighted / totalValue) * 10) / 10;
    }
    const sumSimple = rows.reduce((s, r) => s + (r.expected_return || 12), 0);
    return Math.round((sumSimple / rows.length) * 10) / 10;
  }, [rows, totalValue]);

  // Asset allocation donut chart data
  const allocationData = useMemo(() => {
    const agg = {};
    rows.forEach((r) => {
      const t = r.inv_type || "Other";
      agg[t] = (agg[t] || 0) + (r.amount || 0);
    });
    return Object.entries(agg).map(([type, amount]) => ({
      name: type,
      amount: Math.round(amount),
      pct: totalValue > 0 ? Math.round((amount / totalValue) * 100) : 0,
      color: ASSET_TYPES[type]?.color || "#94a3b8",
      icon: ASSET_TYPES[type]?.icon || "💼",
    })).sort((a, b) => b.amount - a.amount);
  }, [rows, totalValue]);

  // Filtered & sorted holdings
  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || (r.inv_type || "").toLowerCase().includes(q));
    }
    if (typeFilter !== "all") {
      list = list.filter((r) => r.inv_type === typeFilter);
    }
    if (sortBy === "val_desc") list.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    else if (sortBy === "return_desc") list.sort((a, b) => (b.expected_return || 0) - (a.expected_return || 0));
    else if (sortBy === "sip_desc") list.sort((a, b) => (b.monthly_inflow || 0) - (a.monthly_inflow || 0));
    else if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [rows, search, typeFilter, sortBy]);

  // Active SIP holdings
  const activeSipHoldings = useMemo(() => rows.filter((r) => (r.monthly_inflow || 0) > 0), [rows]);
  const pendingSipHoldings = useMemo(() => activeSipHoldings.filter((r) => !r.is_debited_this_month), [activeSipHoldings]);

  // Projected wealth & returns summary
  const extraSipNum = parseFloat(sipExtra) || 0;
  const totalPrincipalInvested = useMemo(() => {
    return proj?.total_invested ?? (totalValue + (totalMonthlySip + extraSipNum) * 12 * projYears);
  }, [proj, totalValue, totalMonthlySip, extraSipNum, projYears]);

  const projectedFuture = useMemo(() => {
    return proj?.final_value ?? (proj?.points?.length ? proj.points[proj.points.length - 1].value : (sug?.projected_10y || 0));
  }, [proj, sug]);

  const estimatedWealthGain = useMemo(() => {
    return proj?.total_gain ?? Math.max(0, projectedFuture - totalPrincipalInvested);
  }, [proj, projectedFuture, totalPrincipalInvested]);

  const gainPercent = useMemo(() => {
    return totalPrincipalInvested > 0 ? Math.round((estimatedWealthGain / totalPrincipalInvested) * 100) : 0;
  }, [estimatedWealthGain, totalPrincipalInvested]);

  const returnMultiplier = useMemo(() => {
    return proj?.return_multiplier ?? (totalPrincipalInvested > 0 ? (projectedFuture / totalPrincipalInvested).toFixed(1) : 1);
  }, [proj, projectedFuture, totalPrincipalInvested]);

  const effectiveAnnualRate = useMemo(() => {
    return proj?.annual_rate ?? (parseFloat(customRate) || weightedReturn || 12);
  }, [proj, customRate, weightedReturn]);

  if (loading) {
    return (
      <div className="grid place-items-center h-72">
        <div className="text-center space-y-3">
          <div className="pulse text-4xl">📈</div>
          <div className="muted text-sm font-semibold">Loading Investment Portfolio…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1300px] mx-auto pb-12">
      {/* ── TOP BANNER TICKER & MARKET SHORTCUT ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border transition hover:border-[var(--accent)]"
           style={{ background: "color-mix(in srgb, var(--accent) 7%, var(--card))", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-2xl animate-pulse">🔥</span>
          <div>
            <div className="font-extrabold flex items-center gap-2">
              <span>Live Indian Market Trends & Momentum Stocks</span>
              <span className="badge font-bold !py-0.5 text-[10px]" style={{ background: "var(--accent)", color: "#000" }}>LIVE</span>
            </div>
            <div className="muted text-[11.5px] mt-0.5">
              Check real-time Nifty 50 momentum, top gainers, and sector rotation analysis
            </div>
          </div>
        </div>
        <Link to="/market" className="btn btn-sm btn-primary shrink-0 self-start sm:self-center">
          Explore Markets →
        </Link>
      </div>

      {/* ── HEADER & ACTIONS ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11.5px] font-bold mb-1.5"
               style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
            <span>📈 Wealth Engine</span>
            <span>·</span>
            <span>Compounding Simulator</span>
            <span>·</span>
            <span>{rows.length} Holdings</span>
          </div>
          <h1 className="text-[26px] font-extrabold tracking-tight flex items-center gap-2.5">
            <span>📈</span> {t("investments")} & Portfolio Tracker
          </h1>
          <p className="muted text-[13.5px] mt-0.5">
            Track assets, visualize 10-year compounding growth, and optimize portfolio allocation.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-sm"
            onClick={exportCSV}
            disabled={!rows.length}
            title="Download CSV"
          >
            📥 Export CSV
          </button>
          <button
            className="btn btn-sm"
            onClick={loadAiReview}
            disabled={loadingAiReview}
            title="Refresh Gemini AI Portfolio Review"
          >
            {loadingAiReview ? "Analyzing…" : "🤖 AI Review"}
          </button>
          <button
            className="btn btn-sm btn-primary shadow-lg"
            onClick={() => openModal()}
          >
            ＋ Add Investment
          </button>
        </div>
      </div>

      {/* ── 4 EXECUTIVE METRIC CARDS ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Total Portfolio Value */}
        <div className="card fade-up !p-4.5 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-bold uppercase tracking-wider">Total Portfolio Value</span>
            <span className="text-xl">💼</span>
          </div>
          <div className="text-[26px] font-extrabold mono mt-1.5" style={{ color: "var(--accent)" }}>
            {inr(totalValue)}
          </div>
          <div className="muted text-[11.5px] mt-1 flex items-center gap-1.5">
            <span className="font-semibold text-[var(--text)]">{rows.length} Active Holdings</span>
          </div>
        </div>

        {/* Monthly SIP Commitments */}
        <div className="card fade-up !p-4.5 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-bold uppercase tracking-wider">Monthly SIP Inflow</span>
            <span className="text-xl">🔄</span>
          </div>
          <div className="text-[26px] font-extrabold mono mt-1.5 text-[var(--accent-2)]">
            {inr(totalMonthlySip)}<span className="text-[13px] font-semibold muted">/mo</span>
          </div>
          <div className="muted text-[11.5px] mt-1">
            {totalMonthlySip > 0 ? `${inr(totalMonthlySip * 12)}/year disciplined investment` : "No ongoing monthly SIP"}
          </div>
        </div>

        {/* Weighted Expected Return */}
        <div className="card fade-up !p-4.5 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-bold uppercase tracking-wider">Weighted Return</span>
            <span className="text-xl">⚡</span>
          </div>
          <div className="text-[26px] font-extrabold mono mt-1.5" style={{ color: weightedReturn >= 12 ? "var(--accent)" : "var(--warning)" }}>
            {weightedReturn}% <span className="text-[13px] font-semibold muted">p.a.</span>
          </div>
          <div className="muted text-[11.5px] mt-1">
            Amount-weighted annualized compounding
          </div>
        </div>

        {/* Projected 10-Year Wealth */}
        <div className="card fade-up !p-4.5 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-bold uppercase tracking-wider">{projYears}-Yr Projected Wealth</span>
            <span className="text-xl">🏆</span>
          </div>
          <div className="text-[26px] font-extrabold mono mt-1.5" style={{ color: "var(--accent)" }}>
            {compact(projectedFuture)}
          </div>
          <div className="muted text-[11.5px] mt-1">
            At current compounding velocity
          </div>
        </div>
      </div>

      {/* ── ASSET ALLOCATION & WEALTH COMPOUNDING SECTION ─────────────────── */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* LEFT: Asset Allocation Donut Chart (5 cols) */}
        <div className="lg:col-span-5 card fade-up !p-5 border flex flex-col justify-between" style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "var(--border)" }}>
              <div>
                <h3 className="font-extrabold text-[16px] flex items-center gap-2">
                  <span>🧭</span> Asset Diversification
                </h3>
                <p className="muted text-[11.5px]">Portfolio asset-class breakdown</p>
              </div>
              <span className="badge font-bold" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                {allocationData.length} Classes
              </span>
            </div>

            {allocationData.length === 0 ? (
              <div className="py-16 text-center muted text-[13px]">
                Koi investment add nahi hai. ＋ Add Investment par click karein.
              </div>
            ) : (
              <div className="pt-2">
                <div className="h-56 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationData}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {allocationData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val, name) => [inr(val), name]}
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          color: "var(--text)",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Centered Total Overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-[10.5px] muted uppercase tracking-wider font-bold">Total Assets</span>
                    <span className="text-[16px] font-extrabold mono">{compact(totalValue)}</span>
                  </div>
                </div>

                {/* Allocation Chips Breakdown */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {allocationData.map((item) => (
                    <div
                      key={item.name}
                      className="p-2 rounded-xl border flex items-center justify-between text-[12px]"
                      style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                        <span className="truncate font-semibold">{item.icon} {item.name}</span>
                      </div>
                      <span className="mono font-bold shrink-0">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t text-[11.5px] muted flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <span>Healthy Indian Rule: ~60% Equity, 20% Debt/FD, 10% Gold, 10% Liquid</span>
          </div>
        </div>

        {/* RIGHT: Interactive Wealth Compounding Simulator (7 cols) */}
        <div className="lg:col-span-7 card fade-up !p-5 border space-y-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
            <div>
              <h3 className="font-extrabold text-[16px] flex items-center gap-2">
                <span>📈</span> Compounding Wealth Simulator
              </h3>
              <p className="muted text-[11.5px]">Live calculation of invested capital vs. compounded returns gain</p>
            </div>

            {/* Duration Selector */}
            <div className="flex rounded-lg p-0.5 border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
              {[5, 10, 15, 20, 25].map((y) => (
                <button
                  key={y}
                  onClick={() => setProjYears(y)}
                  className={`px-2.5 py-1 rounded text-[11.5px] font-bold transition ${
                    projYears === y ? "bg-[var(--card)] shadow text-[var(--accent)]" : "muted hover:text-[var(--text)]"
                  }`}
                >
                  {y}Y
                </button>
              ))}
            </div>
          </div>

          {/* Dual Interactive Controls: Extra Monthly SIP & Expected Annual Return % */}
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Control 1: Extra Monthly SIP (What-If) */}
            <div className="p-3 rounded-xl border space-y-2" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold flex items-center gap-1.5">
                  <span>⚡</span> Extra Monthly SIP:
                </span>
                <span className="text-[11px] muted font-mono">+{inr(extraSipNum)}/mo</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1.5 muted font-bold text-[13px]">₹</span>
                  <input
                    type="number"
                    placeholder="0"
                    min="0"
                    step="500"
                    className="input mono !w-full !py-1 !pl-6 !text-[13px] font-bold"
                    value={sipExtra}
                    onChange={(e) => setSipExtra(e.target.value)}
                  />
                </div>
              </div>

              {/* Quick increment chips */}
              <div className="flex flex-wrap gap-1 pt-0.5">
                {[1000, 2500, 5000, 10000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSipExtra(String(amt))}
                    className="btn btn-sm !py-0.5 !px-2 text-[10.5px]"
                  >
                    +{compact(amt)}
                  </button>
                ))}
                {extraSipNum > 0 && (
                  <button
                    type="button"
                    onClick={() => setSipExtra("")}
                    className="btn btn-sm !py-0.5 !px-1.5 text-[10.5px] text-[var(--danger)]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Control 2: Expected Annual Return Rate (% p.a.) */}
            <div className="p-3 rounded-xl border space-y-2" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold flex items-center gap-1.5">
                  <span>🎯</span> Expected Return (% p.a.):
                </span>
                <span className="text-[12px] font-bold mono" style={{ color: "var(--accent)" }}>
                  {customRate}% p.a.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="0.5"
                  className="w-full accent-[var(--accent)] cursor-pointer"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                />
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="0.5"
                  className="input mono !w-16 !py-1 !px-1.5 !text-[12px] font-bold text-center"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                />
              </div>

              {/* Quick Preset Chips */}
              <div className="flex flex-wrap gap-1 pt-0.5">
                {[
                  { label: "7% FD", val: "7" },
                  { label: "10% Gold", val: "10" },
                  { label: "12% Nifty", val: "12" },
                  { label: "15% Equity", val: "15" },
                  { label: "18% MidCap", val: "18" },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setCustomRate(p.val)}
                    className={`btn btn-sm !py-0.5 !px-1.5 text-[10.5px] ${
                      customRate === p.val ? "btn-primary !py-0.5" : ""
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4 Compounding Outcome Highlights (Invested vs. Gain vs. Future Value) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
            {/* Total Invested Principal */}
            <div className="p-2.5 rounded-xl border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
              <div className="text-[10px] muted uppercase font-bold tracking-wider">Invested Capital</div>
              <div className="text-[15px] font-extrabold mono mt-0.5">{compact(totalPrincipalInvested)}</div>
              <div className="text-[10px] muted mt-0.5">Your contribution</div>
            </div>

            {/* Compounded Return / Wealth Gain */}
            <div className="p-2.5 rounded-xl border relative overflow-hidden"
                 style={{ background: "color-mix(in srgb, #10b981 8%, var(--bg-soft))", borderColor: "rgba(16, 185, 129, 0.3)" }}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                Wealth Gain (Return)
              </div>
              <div className="text-[15px] font-extrabold mono mt-0.5 text-emerald-500">
                +{compact(estimatedWealthGain)}
              </div>
              <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                +{gainPercent}% pure profit
              </div>
            </div>

            {/* Total Maturity Value */}
            <div className="p-2.5 rounded-xl border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
              <div className="text-[10px] muted uppercase font-bold tracking-wider">Total Future Corpus</div>
              <div className="text-[15px] font-extrabold mono mt-0.5" style={{ color: "var(--accent)" }}>
                {compact(projectedFuture)}
              </div>
              <div className="text-[10px] muted mt-0.5">Principal + Profit</div>
            </div>

            {/* Wealth Multiplier */}
            <div className="p-2.5 rounded-xl border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
              <div className="text-[10px] muted uppercase font-bold tracking-wider">Multiplier</div>
              <div className="text-[15px] font-extrabold mono mt-0.5 text-[var(--accent-2)]">
                {returnMultiplier}x
              </div>
              <div className="text-[10px] muted mt-0.5">at {effectiveAnnualRate}% p.a.</div>
            </div>
          </div>

          {/* Interactive Stacked Dual-Area Chart (Invested vs Returns Gain) */}
          <div className="h-64 w-full pt-2">
            <div className="flex items-center justify-end gap-3 text-[11px] mb-1 font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#3b82f6" }} />
                <span>Invested Capital</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#10b981" }} />
                <span>Compounded Gain (Return)</span>
              </span>
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={proj?.points?.map((p, i) => ({
                  ...p,
                  label: i === 0 ? "Now" : `Yr ${Math.ceil(p.month / 12)}`,
                })) ?? []}
                margin={{ top: 8, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="investedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gainGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => compact(v).replace("₹", "")}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  width={60}
                />
                <Tooltip
                  formatter={(val, name) => {
                    const label = name === "invested" ? "Invested Capital" : name === "gain" ? "Compounded Gain (Return)" : "Total Corpus";
                    return [inr(val), label];
                  }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--text)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="invested"
                  stackId="1"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#investedGrad)"
                  name="invested"
                />
                <Area
                  type="monotone"
                  dataKey="gain"
                  stackId="1"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#gainGrad)"
                  name="gain"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── MONTHLY SIP AUTO-DEBIT & INCOME DEDUCTION ENGINE ─────────────── */}
      <div className="card fade-up !p-5 border space-y-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl grid place-items-center text-xl" style={{ background: "color-mix(in srgb, var(--accent-2) 15%, transparent)" }}>
              🔄
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-[16px]">Monthly SIP Auto-Debit & Deduction Engine</h3>
                <span className="badge text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                  AUTO-BALANCE SYNC
                </span>
              </div>
              <p className="muted text-[12px] mt-0.5">
                Active SIP installments automatically credit into your portfolio and deduct from monthly available income.
              </p>
            </div>
          </div>

          {/* Quick Action Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => executeAutoSip()}
              disabled={executingSip || activeSipHoldings.length === 0}
              className="btn btn-sm btn-primary flex items-center gap-2 shadow"
            >
              <span>{executingSip ? "⏳ Processing SIPs…" : "⚡ Run Auto-SIP Now"}</span>
            </button>
          </div>
        </div>

        {/* SIP Status & Inflow Metric Grid */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl border flex items-center justify-between" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
            <div>
              <div className="text-[11px] muted font-bold uppercase">Total Monthly SIP Inflow</div>
              <div className="text-[18px] font-extrabold mono mt-0.5 text-[var(--accent-2)]">
                {inr(totalMonthlySip)}<span className="text-[12px] muted font-normal">/mo</span>
              </div>
            </div>
            <span className="text-2xl">📈</span>
          </div>

          <div className="p-3 rounded-xl border flex items-center justify-between" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
            <div>
              <div className="text-[11px] muted font-bold uppercase">Active SIP Plans</div>
              <div className="text-[18px] font-extrabold mono mt-0.5">
                {activeSipHoldings.length} Holdings
              </div>
            </div>
            <span className="text-2xl">🔄</span>
          </div>

          <div className="p-3 rounded-xl border flex items-center justify-between" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
            <div>
              <div className="text-[11px] muted font-bold uppercase">This Month's Execution Status</div>
              <div className="text-[14px] font-extrabold mt-0.5 flex items-center gap-1.5">
                {pendingSipHoldings.length === 0 ? (
                  <span className="text-emerald-500 flex items-center gap-1">
                    <span>✅</span> All Debited for {today().slice(0, 7)}
                  </span>
                ) : (
                  <span className="text-amber-500 flex items-center gap-1">
                    <span>⏳</span> {pendingSipHoldings.length} Pending Execution
                  </span>
                )}
              </div>
            </div>
            <span className="text-2xl">🛡️</span>
          </div>
        </div>

        {/* Active SIP List */}
        {activeSipHoldings.length > 0 ? (
          <div className="space-y-2 pt-1">
            <div className="text-[12px] font-bold muted uppercase tracking-wider">Active Monthly Auto-Debits:</div>
            <div className="grid md:grid-cols-2 gap-2.5">
              {activeSipHoldings.map((sip) => {
                const meta = ASSET_TYPES[sip.inv_type] || ASSET_TYPES["Other"];
                return (
                  <div
                    key={sip.id}
                    className="p-3 rounded-xl border flex items-center justify-between transition hover:border-[var(--accent)]"
                    style={{ background: "var(--card)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-xl">{meta.icon}</span>
                      <div className="truncate">
                        <div className="font-bold text-[13px] truncate">{sip.name}</div>
                        <div className="text-[11px] muted flex items-center gap-1.5 mt-0.5">
                          <span>{sip.inv_type}</span>
                          <span>·</span>
                          <span>{sip.expected_return}% p.a.</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="mono font-extrabold text-[14px] text-[var(--accent-2)]">
                          {inr(sip.monthly_inflow)}/mo
                        </div>
                        {sip.is_debited_this_month ? (
                          <span className="badge text-[10px] font-bold text-emerald-500 bg-emerald-500/10 mt-0.5">
                            ✅ Debited ({today().slice(0, 7)})
                          </span>
                        ) : (
                          <span className="badge text-[10px] font-bold text-amber-500 bg-amber-500/10 mt-0.5">
                            ⏳ Due This Month
                          </span>
                        )}
                      </div>

                      {!sip.is_debited_this_month && (
                        <button
                          onClick={() => executeAutoSip(sip.id)}
                          disabled={executingSip}
                          className="btn btn-sm !py-1 !px-2.5 text-[11px] font-bold"
                          title="Execute single SIP debit"
                        >
                          Debit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border text-center muted text-[12.5px]" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
            Aapne abhi koi recurring monthly SIP set nahi ki hai. Naya investment add karte samay <b>Monthly Inflow (SIP)</b> amount enter karein!
          </div>
        )}

        {/* Mechanism explanation note */}
        <div className="p-3 rounded-xl border text-[11.5px] leading-relaxed flex items-start gap-2.5"
             style={{ background: "color-mix(in srgb, var(--accent) 5%, var(--bg-soft))", borderColor: "var(--border)" }}>
          <span className="text-base shrink-0">💡</span>
          <div>
            <b>Auto-Debit & Balance Deduction Mechanism:</b> Har mahine jab aapka SIP trigger hota hai, ye amount seedha aapke investment holding me add ho jati hai aur saath hi <b>Expenses (Category: Investment)</b> me Auto-Debit ke roop me record ho jati hai — jisse aapki monthly income me se ye bachat safely deduct hoke aapka cash in hand balance 100% accurate rehta hai!
          </div>
        </div>
      </div>

      {/* ── AI PORTFOLIO REVIEW & RISK SUGGESTIONS ───────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Gemini AI Live Portfolio Review (7 cols) */}
        <div className="lg:col-span-7 card fade-up !p-6 border space-y-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl grid place-items-center text-xl bg-[var(--bg-soft)]">
                🤖
              </div>
              <div>
                <h3 className="font-extrabold text-[16px]">FinMate AI Wealth Advisor</h3>
                <p className="muted text-[11.5px]">Powered by Gemini 3.5 Flash & Ledger Verification</p>
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={loadAiReview}
              disabled={loadingAiReview}
              title="Re-analyze portfolio"
            >
              {loadingAiReview ? "Analyzing…" : "🔄 Refresh"}
            </button>
          </div>

          <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
            {loadingAiReview ? (
              <div className="py-8 text-center muted space-y-2">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-[var(--accent)] animate-spin mx-auto" />
                <div>AI analyzing your asset allocation and compounding…</div>
              </div>
            ) : aiReview ? (
              <div className="p-4 rounded-xl border leading-relaxed" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
                {aiReview}
              </div>
            ) : (
              <div className="muted text-center py-6">
                Invest in diversified Index Funds and Sovereign Gold to compound wealth systematically.
              </div>
            )}
          </div>
        </div>

        {/* Suggested Asset Allocation from Real Numbers (5 cols) */}
        <div className="lg:col-span-5 card fade-up !p-6 border space-y-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div>
              <h3 className="font-extrabold text-[16px] flex items-center gap-2">
                <span>🎯</span> Recommended SIP Plan
              </h3>
              <p className="muted text-[11.5px]">
                Risk profile: <b className="text-[var(--text)] uppercase">{sug?.risk_profile || "Balanced"}</b>
              </p>
            </div>
          </div>

          {sug?.allocation ? (
            <div className="space-y-2.5">
              {sug.allocation.map((a) => (
                <div
                  key={a.name}
                  className="p-3 rounded-xl border flex items-center justify-between text-[12.5px]"
                  style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}
                >
                  <div>
                    <div className="font-bold">{a.name}</div>
                    <div className="muted text-[11px] mt-0.5">{a.rationale}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="mono font-extrabold text-[14px]" style={{ color: "var(--accent)" }}>
                      {inr(a.amount)}/mo
                    </div>
                    <span className="badge text-[10.5px] mt-0.5 font-bold"
                          style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                      ~{a.expected_return_pct}% p.a.
                    </span>
                  </div>
                </div>
              ))}
              <div className="text-[10.5px] muted pt-1">
                ⚠️ Educational recommendations — review before executing orders on broker.
              </div>
            </div>
          ) : (
            <div className="muted text-center py-8 text-[12.5px]">
              {sug?.steps?.map((step, i) => (
                <div key={i} className="py-1">• {step}</div>
              )) || "Start by building an emergency fund of 6 months expenses."}
            </div>
          )}
        </div>
      </div>

      {/* ── HOLDINGS DIRECTORY (CARDS & TABLE VIEW) ──────────────────────── */}
      <div className="space-y-4 pt-2">
        {/* Search, Filter & View Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-2.5 muted text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search holding name or type…"
              className="input pl-9 !py-1.5 !text-[13px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Type Filter Pills & Mode Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input !py-1.5 !px-2.5 !text-[12.5px] font-medium !w-auto"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Asset Types</option>
              {Object.keys(ASSET_TYPES).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>

            <select
              className="input !py-1.5 !px-2.5 !text-[12.5px] font-medium !w-auto"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="val_desc">Sort: Highest Value</option>
              <option value="return_desc">Sort: Expected Return %</option>
              <option value="sip_desc">Sort: Monthly SIP</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>

            <div className="flex rounded-lg border p-0.5" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
              <button
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1 rounded text-[12px] font-bold ${
                  viewMode === "cards" ? "bg-[var(--card)] shadow text-[var(--accent)]" : "muted"
                }`}
                title="Cards Grid View"
              >
                🗂️ Cards
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`px-2.5 py-1 rounded text-[12px] font-bold ${
                  viewMode === "table" ? "bg-[var(--card)] shadow text-[var(--accent)]" : "muted"
                }`}
                title="Table View"
              >
                📋 Table
              </button>
            </div>
          </div>
        </div>

        {/* Display Holdings */}
        {filteredRows.length === 0 ? (
          <div className="card text-center py-12 space-y-3 border border-dashed" style={{ borderColor: "var(--border)" }}>
            <div className="text-4xl">💼</div>
            <div className="font-extrabold text-[16px]">
              {rows.length === 0 ? "No investments recorded yet" : "No investments match the search / filter"}
            </div>
            <p className="muted text-[13px] max-w-md mx-auto">
              SIP, Mutual Funds, Stocks, Gold ya FDs add karke apna net worth track karein!
            </p>
            <div className="pt-2">
              <button className="btn btn-primary" onClick={() => openModal()}>
                ＋ Add First Investment
              </button>
            </div>
          </div>
        ) : viewMode === "cards" ? (
          /* ── CARDS VIEW ────────────────────────────────────────────────── */
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRows.map((r) => {
              const meta = ASSET_TYPES[r.inv_type] || ASSET_TYPES["Other"];
              return (
                <div
                  key={r.id}
                  className="card fade-up !p-5 relative flex flex-col justify-between border transition duration-200 hover:shadow-lg"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <div>
                    {/* Top Row: Type pill & Expected Return */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className="badge font-bold flex items-center gap-1.5"
                        style={{
                          background: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
                          color: meta.color,
                        }}
                      >
                        <span>{meta.icon}</span>
                        <span>{r.inv_type}</span>
                      </span>

                      <span
                        className="badge font-bold mono"
                        style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
                      >
                        ⚡ {r.expected_return}% p.a.
                      </span>
                    </div>

                    {/* Instrument Name */}
                    <h3 className="font-extrabold text-[16px] truncate" title={r.name}>
                      {r.name}
                    </h3>

                    {/* Note if available */}
                    {r.note && (
                      <p className="muted text-[11.5px] truncate mt-0.5" title={r.note}>
                        {r.note}
                      </p>
                    )}

                    {/* Value & SIP breakdown */}
                    <div className="pt-3 pb-1 border-t mt-3 flex items-baseline justify-between" style={{ borderColor: "var(--border)" }}>
                      <div>
                        <div className="text-[11px] font-bold muted uppercase tracking-wider">Current Value</div>
                        <div className="text-[20px] font-extrabold mono" style={{ color: "var(--accent)" }}>
                          {inr(r.amount)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[11px] font-bold muted uppercase tracking-wider">Monthly SIP</div>
                        <div className="text-[16px] font-bold mono text-[var(--accent-2)]">
                          {r.monthly_inflow ? `${inr(r.monthly_inflow)}/mo` : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Auto-Debit SIP Status if applicable */}
                    {r.monthly_inflow > 0 && (
                      <div className="pt-2 pb-0.5 border-t mt-2 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1 font-semibold">
                          <span>🔄 SIP:</span>
                          {r.is_debited_this_month ? (
                            <span className="text-emerald-500 font-bold">Debited ({today().slice(0, 7)}) ✅</span>
                          ) : (
                            <span className="text-amber-500 font-bold">Due for {today().slice(0, 7)} ⏳</span>
                          )}
                        </span>
                        {!r.is_debited_this_month && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              executeAutoSip(r.id);
                            }}
                            disabled={executingSip}
                            className="btn btn-sm !py-0.5 !px-2 text-[10.5px] font-bold"
                          >
                            Debit Now
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Share % and Action buttons */}
                  <div className="pt-3 mt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)" }}>
                    <span className="text-[11px] muted font-medium">
                      Portf: <b>{r.share_pct || 0}%</b> · Since {r.start_date ? r.start_date.slice(0, 7) : "—"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        className="btn btn-sm !py-1 !px-2.5 text-[11.5px]"
                        onClick={() => openModal(r)}
                        title="Edit holding"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn btn-sm !py-1 !px-2 text-[11.5px] text-[var(--danger)] hover:bg-[var(--danger)]/10"
                        onClick={() => handleDelete(r.id, r.name)}
                        title="Remove holding"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── TABLE VIEW ────────────────────────────────────────────────── */
          <div className="card !p-0 overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <tr>
                    <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Instrument</th>
                    <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Asset Type</th>
                    <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted text-right">Current Value</th>
                    <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted text-right">Monthly SIP</th>
                    <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted text-right">Exp. Return</th>
                    <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Start Date</th>
                    <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {filteredRows.map((r) => {
                    const meta = ASSET_TYPES[r.inv_type] || ASSET_TYPES["Other"];
                    return (
                      <tr key={r.id} className="hover:bg-[var(--card-2)] transition">
                        <td className="py-3 px-4 font-bold">
                          <div className="truncate max-w-xs">{r.name}</div>
                          {r.note && <div className="muted text-[11px] truncate max-w-xs">{r.note}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="badge text-[11px] font-bold"
                            style={{ background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, color: meta.color }}
                          >
                            {meta.icon} {r.inv_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 mono font-extrabold text-right" style={{ color: "var(--accent)" }}>
                          {inr(r.amount)}
                        </td>
                        <td className="py-3 px-4 mono font-bold text-right text-[var(--accent-2)]">
                          {r.monthly_inflow ? (
                            <div>
                              <div>{inr(r.monthly_inflow)}</div>
                              <div className="text-[10px] mt-0.5">
                                {r.is_debited_this_month ? (
                                  <span className="text-emerald-500 font-semibold">✅ Debited</span>
                                ) : (
                                  <span className="text-amber-500 font-semibold">⏳ Pending</span>
                                )}
                              </div>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="py-3 px-4 mono font-semibold text-right">
                          {r.expected_return}%
                        </td>
                        <td className="py-3 px-4 text-[12px] muted">
                          {r.start_date ? r.start_date.slice(0, 10) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            className="btn btn-sm !py-1 !px-2"
                            onClick={() => openModal(r)}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-sm !py-1 !px-2 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                            onClick={() => handleDelete(r.id, r.name)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: ADD / EDIT INVESTMENT ─────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 fade-up"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="card !p-6 w-full max-w-lg space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{editingId ? "✏️" : "➕"}</span>
                <div>
                  <h3 className="font-extrabold text-[17px]">
                    {editingId ? "Edit Investment Holding" : "Add Investment to Portfolio"}
                  </h3>
                  <p className="muted text-[11.5px]">Track your wealth assets and compounding trajectory</p>
                </div>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full grid place-items-center muted hover:text-white hover:bg-white/10"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Name */}
              <div>
                <label className="label">Instrument / Scheme Name</label>
                <input
                  type="text"
                  placeholder="e.g. UTI Nifty 50 Index Fund, HDFC Midcap SIP, SBI 5Y FD"
                  className="input font-semibold"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              {/* Asset Type selection chips */}
              <div>
                <label className="label">Asset Class / Type</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 p-1 border rounded-xl"
                     style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
                  {Object.entries(ASSET_TYPES).map(([type, meta]) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setForm({ ...form, inv_type: type, expected_return: String(meta.defaultReturn) })}
                      className={`p-2 rounded-lg text-[11px] font-bold flex flex-col items-center gap-1 transition ${
                        form.inv_type === type
                          ? "bg-[var(--accent)] text-black shadow"
                          : "hover:bg-[var(--card)]"
                      }`}
                    >
                      <span className="text-base">{meta.icon}</span>
                      <span className="truncate">{type}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Value & Monthly SIP */}
              <div className="grid sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="label">Current Accumulated Value (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-bold muted text-[15px]">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="0"
                      className="input mono font-extrabold text-[16px] pl-8"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Monthly SIP Inflow (₹/mo)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-bold muted text-[15px]">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="0 (if one-time)"
                      className="input mono font-extrabold text-[16px] pl-8"
                      value={form.monthly_inflow}
                      onChange={(e) => setForm({ ...form, monthly_inflow: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Expected Return & Start Date */}
              <div className="grid sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="label">Expected Return (% p.a.)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="40"
                      step="0.1"
                      className="input mono font-bold"
                      value={form.expected_return}
                      onChange={(e) => setForm({ ...form, expected_return: e.target.value })}
                      required
                    />
                    <span className="absolute right-3 top-2.5 muted font-bold text-[13px]">%</span>
                  </div>
                  <div className="text-[10.5px] muted mt-1">
                    Guideline: FD ~7%, Gold ~9%, Index ~12%, Equity ~15%
                  </div>
                </div>

                <div>
                  <label className="label">Start Date</label>
                  <input
                    type="date"
                    className="input font-medium"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="label">Notes / Folio / Broker (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Zerodha Coin, Groww, Folio #12345"
                  className="input text-[13px]"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary flex-1 py-3 font-bold text-[14px]"
                  disabled={savingForm || !form.name.trim()}
                >
                  {savingForm ? "Saving…" : editingId ? "Update Investment" : "Save to Portfolio"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
