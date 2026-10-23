import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, compact, catIcon, catColor, CATEGORY_META } from "../format.js";

const ALL_CATEGORIES = [
  "Food", "Groceries", "Fuel", "Rent", "EMI", "Medical",
  "Transport", "Entertainment", "Shopping", "Utilities",
  "Education", "Travel", "Other"
];

export default function Budget() {
  const { push } = useToast();
  const { t } = useLang();

  // Primary budget data from server
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // AI & Analytics states
  const [forecast, setForecast] = useState(null);
  const [forecasting, setForecasting] = useState(false);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [mailing, setMailing] = useState(false);

  // UI Filters & View Mode
  const [filter, setFilter] = useState("all"); // "all" | "over" | "warning" | "safe"
  const [sortBy, setSortBy] = useState("pct_desc"); // "pct_desc" | "spent_desc" | "limit_desc" | "name"
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table"

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  // Form states
  const [formCategory, setFormCategory] = useState("Food");
  const [formLimit, setFormLimit] = useState("");
  const [savingForm, setSavingForm] = useState(false);

  // 50/30/20 Preset Form
  const [presetIncome, setPresetIncome] = useState("50000");
  const [presetRule, setPresetRule] = useState("50-30-20");
  const [applyingPreset, setApplyingPreset] = useState(false);

  // Load budgets data
  const loadData = async () => {
    try {
      const res = await api("/api/budget");
      setData(res);
      if (res.summary?.income_this_month && res.summary.income_this_month > 0) {
        setPresetIncome(String(Math.round(res.summary.income_this_month)));
      }
    } catch (e) {
      push(e.message || "Failed to load budget data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadAiAdvice();
  }, []);

  // Fetch AI Budget Advice
  async function loadAiAdvice() {
    setLoadingAdvice(true);
    try {
      const r = await api("/api/budget/ai-advice");
      setAiAdvice(r.advice);
    } catch (e) {
      setAiAdvice(null);
    } finally {
      setLoadingAdvice(false);
    }
  }

  // Run Holt's AI Prediction
  async function runForecast() {
    setForecasting(true);
    try {
      const res = await api("/api/budget/predict", { method: "POST", body: {} });
      setForecast(res);
      push("✨ AI budget forecast generated successfully!", "success");
    } catch (e) {
      push(e.message || "Failed to generate AI forecast", "error");
    } finally {
      setForecasting(false);
    }
  }

  // Open modal for new budget or editing existing
  function openAddModal(existing = null) {
    if (existing) {
      setEditingBudget(existing);
      setFormCategory(existing.category);
      setFormLimit(String(existing.limit));
    } else {
      setEditingBudget(null);
      // Pick first category not yet configured, or "Food"
      const configured = (data?.budgets || []).map((b) => b.category);
      const firstUnused = ALL_CATEGORIES.find((c) => !configured.includes(c)) || "Food";
      setFormCategory(firstUnused);
      setFormLimit("");
    }
    setModalOpen(true);
  }

  // Save Add/Edit budget
  async function handleSaveBudget(e) {
    e?.preventDefault();
    const limitNum = parseFloat(formLimit);
    if (!limitNum || limitNum <= 0) {
      push("Kripya valid monthly limit daalein (positive number).", "error");
      return;
    }

    setSavingForm(true);
    try {
      if (editingBudget?.id) {
        await api(`/api/budget/${editingBudget.id}`, {
          method: "PUT",
          body: { monthly_limit: limitNum },
        });
        push(`✅ ${formCategory} budget updated to ${inr(limitNum)}`, "success");
      } else {
        await api("/api/budget", {
          method: "POST",
          body: { category: formCategory, monthly_limit: limitNum },
        });
        push(`✅ ${formCategory} budget set to ${inr(limitNum)}`, "success");
      }
      setModalOpen(false);
      setEditingBudget(null);
      setFormLimit("");
      loadData();
    } catch (err) {
      push(err.message || "Budget save nahi ho paya", "error");
    } finally {
      setSavingForm(false);
    }
  }

  // Delete a budget
  async function handleDelete(id, categoryName) {
    if (!window.confirm(`Kya aap sach me '${categoryName}' budget limit delete karna chahte hain?`)) {
      return;
    }
    try {
      await api(`/api/budget/${id}`, { method: "DELETE" });
      push(`🗑️ ${categoryName} budget deleted`, "success");
      loadData();
    } catch (e) {
      push(e.message || "Delete fail ho gaya", "error");
    }
  }

  // Apply 50/30/20 or other preset
  async function handleApplyPreset() {
    const inc = parseFloat(presetIncome);
    if (!inc || inc <= 0) {
      push("Kripya valid monthly income enter karein.", "error");
      return;
    }

    setApplyingPreset(true);
    try {
      const res = await api("/api/budget/apply-preset", {
        method: "POST",
        body: { rule: presetRule, custom_income: inc },
      });
      push(`🎉 ${presetRule.toUpperCase()} budget rule successfully apply ho gaya!`, "success");
      setPresetModalOpen(false);
      loadData();
    } catch (e) {
      push(e.message || "Preset apply nahi ho paya", "error");
    } finally {
      setApplyingPreset(false);
    }
  }

  // Email Alert
  async function sendEmailAlert() {
    setMailing(true);
    try {
      const res = await api("/api/email/budget-alert", { method: "POST" });
      push(
        res.mode === "smtp"
          ? `Budget alert emailed to ${res.to}`
          : `Alert ready (preview saved). ${res.message || ""}`,
        "success"
      );
    } catch (e) {
      push(e.message || "Email alert bhejne me error aayi", "error");
    } finally {
      setMailing(false);
    }
  }

  // Quick increment for modal
  function addAmount(delta) {
    const current = parseFloat(formLimit) || 0;
    setFormLimit(String(Math.max(0, current + delta)));
  }

  // Export Budget summary as CSV
  function exportCSV() {
    if (!data?.budgets?.length) return;
    const headers = ["Category", "Monthly Limit", "Spent", "Remaining", "Percentage Used", "Status"];
    const rows = data.budgets.map((b) => [
      b.category,
      b.limit,
      b.spent,
      b.remaining,
      `${b.pct}%`,
      b.status.toUpperCase(),
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `budget_report_${new Date().toISOString().slice(0, 7)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    push("📥 Budget report downloaded as CSV", "success");
  }

  // Filtered & Sorted Budgets
  const filteredBudgets = useMemo(() => {
    if (!data?.budgets) return [];
    let list = [...data.budgets];

    // Filter
    if (filter === "over") list = list.filter((b) => b.status === "over");
    else if (filter === "warning") list = list.filter((b) => b.status === "warning");
    else if (filter === "safe") list = list.filter((b) => b.status === "safe");

    // Sort
    if (sortBy === "pct_desc") list.sort((a, b) => b.pct - a.pct);
    else if (sortBy === "spent_desc") list.sort((a, b) => b.spent - a.spent);
    else if (sortBy === "limit_desc") list.sort((a, b) => b.limit - a.limit);
    else if (sortBy === "name") list.sort((a, b) => a.category.localeCompare(b.category));

    return list;
  }, [data, filter, sortBy]);

  if (loading) {
    return (
      <div className="grid place-items-center h-72">
        <div className="text-center space-y-3">
          <div className="pulse text-4xl">🎯</div>
          <div className="muted text-sm font-semibold">Smart Budget Loading…</div>
        </div>
      </div>
    );
  }

  const s = data?.summary || {
    total_limit: data?.total_limit || 0,
    total_spent: data?.total_spent || 0,
    total_remaining: (data?.total_limit || 0) - (data?.total_spent || 0),
    overall_pct: data?.overall_pct || 0,
    days_in_month: 30,
    days_passed: 15,
    days_left: 15,
    daily_safe_spend: 0,
    over_count: 0,
    warning_count: 0,
    safe_count: 0,
    total_count: 0,
    month_label: "Current Month",
  };

  const monthPacePct = Math.round((s.days_passed / s.days_in_month) * 100);
  const isSpendingFaster = s.overall_pct > monthPacePct + 5;
  const isSpendingSafely = s.overall_pct <= monthPacePct;

  return (
    <div className="space-y-6 max-w-[1300px] mx-auto pb-12">
      {/* ── TOP HEADER & ACTIONS ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11.5px] font-bold mb-1.5"
               style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
            <span>🎯 Financial Discipline Engine</span>
            <span>·</span>
            <span>{s.month_label}</span>
            <span>·</span>
            <span>{s.days_left} Days Left</span>
          </div>
          <h1 className="text-[26px] font-extrabold tracking-tight flex items-center gap-2.5">
            <span>🎯</span> {t("budget")} & Expense Targets
          </h1>
          <p className="muted text-[13.5px] mt-0.5">
            Set smart category spending caps, prevent over-budget surprises, and track daily spending pace.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-sm"
            onClick={exportCSV}
            disabled={!data?.budgets?.length}
            title="Download CSV"
          >
            📥 Export CSV
          </button>
          <button
            className="btn btn-sm"
            onClick={sendEmailAlert}
            disabled={mailing || !s.total_limit}
            title="Send email alert report"
          >
            {mailing ? "Sending…" : "✉️ Email Alert"}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setPresetModalOpen(true)}
            style={{
              background: "color-mix(in srgb, var(--accent-2) 15%, transparent)",
              borderColor: "var(--accent-2)",
              color: "var(--accent-2)",
            }}
          >
            ⚡ 50/30/20 Auto-Plan
          </button>
          <button
            className="btn btn-sm btn-primary shadow-md"
            onClick={() => openAddModal()}
          >
            ＋ Add / Set Budget
          </button>
        </div>
      </div>

      {/* ── 4 KPI SUMMARY CARDS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Total Budget Limit */}
        <div className="card fade-up !p-4.5 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-bold uppercase tracking-wider">Total Monthly Limit</span>
            <span className="text-xl">🎯</span>
          </div>
          <div className="text-[24px] font-extrabold mono mt-1.5" style={{ color: "var(--accent)" }}>
            {inr(s.total_limit)}
          </div>
          <div className="muted text-[11.5px] mt-1 flex items-center gap-1.5">
            <span>{s.total_count} categories tracked</span>
          </div>
        </div>

        {/* Total Spent */}
        <div className="card fade-up !p-4.5 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-bold uppercase tracking-wider">Total Spent</span>
            <span className="text-xl">💸</span>
          </div>
          <div
            className="text-[24px] font-extrabold mono mt-1.5"
            style={{ color: s.overall_pct > 100 ? "var(--danger)" : s.overall_pct > 80 ? "var(--warning)" : "var(--text)" }}
          >
            {inr(s.total_spent)}
          </div>
          <div className="text-[11.5px] mt-1 flex items-center gap-1.5">
            <span
              className="badge font-bold !py-0.5"
              style={{
                background: s.overall_pct > 100 ? "color-mix(in srgb, var(--danger) 15%, transparent)" : "color-mix(in srgb, var(--accent) 15%, transparent)",
                color: s.overall_pct > 100 ? "var(--danger)" : "var(--accent)",
              }}
            >
              {s.overall_pct}% consumed
            </span>
          </div>
        </div>

        {/* Remaining Buffer */}
        <div className="card fade-up !p-4.5 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-bold uppercase tracking-wider">Safe Remaining Buffer</span>
            <span className="text-xl">🛡️</span>
          </div>
          <div
            className="text-[24px] font-extrabold mono mt-1.5"
            style={{ color: s.total_remaining >= 0 ? "var(--accent)" : "var(--danger)" }}
          >
            {s.total_remaining >= 0 ? inr(s.total_remaining) : `-${inr(Math.abs(s.total_remaining))}`}
          </div>
          <div className="muted text-[11.5px] mt-1">
            {s.total_remaining >= 0 ? "Unspent budget reserve" : "⚠️ Total budget exceeded"}
          </div>
        </div>

        {/* Daily Safe Spend Limit */}
        <div className="card fade-up !p-4.5 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="muted text-[12px] font-bold uppercase tracking-wider">Daily Safe Spend</span>
            <span className="text-xl">⏳</span>
          </div>
          <div className="text-[24px] font-extrabold mono mt-1.5 text-[var(--accent-2)]">
            {inr(s.daily_safe_spend)}<span className="text-[14px] font-medium muted">/day</span>
          </div>
          <div className="muted text-[11.5px] mt-1">
            For next <b>{s.days_left} days</b> to stay on target
          </div>
        </div>
      </div>

      {/* ── OVERALL BUDGET CONSUMPTION & PACE BAR ────────────────────────── */}
      <div className="card fade-up !p-5 border space-y-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <div className="font-extrabold text-[15px]">Monthly Spending Velocity & Pace</div>
              <div className="muted text-[12px]">
                Day {s.days_passed} of {s.days_in_month} ({monthPacePct}% of month elapsed) · Budget spent {s.overall_pct}%
              </div>
            </div>
          </div>

          {/* Pace verdict pill */}
          <div>
            {isSpendingSafely ? (
              <span className="badge font-bold py-1 px-3" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                ✅ Spending Safely Under Pace ({monthPacePct - s.overall_pct}% buffer)
              </span>
            ) : isSpendingFaster ? (
              <span className="badge font-bold py-1 px-3" style={{ background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)" }}>
                ⚠️ Spending Ahead of Pace (+{s.overall_pct - monthPacePct}% faster)
              </span>
            ) : (
              <span className="badge font-bold py-1 px-3" style={{ background: "color-mix(in srgb, var(--warning) 15%, transparent)", color: "var(--warning)" }}>
                ⚖️ Evenly Balanced with Month Pace
              </span>
            )}
          </div>
        </div>

        {/* Dual Progress Bar comparing Spend % vs Time % */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-[11.5px] muted">
            <span>Budget Spent: <b className="text-[var(--text)] mono">{inr(s.total_spent)}</b> ({s.overall_pct}%)</span>
            <span>Total Limit: <b className="text-[var(--text)] mono">{inr(s.total_limit)}</b></span>
          </div>
          <div className="h-3.5 w-full rounded-full overflow-hidden relative" style={{ background: "var(--bg-soft)" }}>
            {/* Target indicator mark for current day of month */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10 shadow"
              style={{ left: `${Math.min(100, monthPacePct)}%` }}
              title={`Day ${s.days_passed} target mark`}
            />
            {/* Actual spent bar */}
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, s.overall_pct)}%`,
                background: s.overall_pct > 100
                  ? "var(--danger)"
                  : s.overall_pct > 80
                  ? "var(--warning)"
                  : "linear-gradient(90deg, var(--accent), var(--accent-2))",
              }}
            />
          </div>
        </div>

        {/* Status Count Badges */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[12px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
            <b>{s.safe_count}</b> on track
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--warning)]" />
            <b>{s.warning_count}</b> near limit (≥80%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--danger)]" />
            <b>{s.over_count}</b> over budget
          </span>
        </div>
      </div>

      {/* ── FILTER & SORT CONTROLS ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5 rounded-xl p-1 border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
          {[
            { id: "all", label: `All (${data?.budgets?.length || 0})` },
            { id: "over", label: `Over Budget (${s.over_count})` },
            { id: "warning", label: `Near Limit (${s.warning_count})` },
            { id: "safe", label: `On Track (${s.safe_count})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold transition ${
                filter === tab.id ? "bg-[var(--card)] shadow text-[var(--text)]" : "muted hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* View Mode & Sort */}
        <div className="flex items-center gap-2">
          <select
            className="input !py-1.5 !px-2.5 !text-[12.5px] font-medium !w-auto"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="pct_desc">Sort: % Used (High to Low)</option>
            <option value="spent_desc">Sort: Highest Spent</option>
            <option value="limit_desc">Sort: Highest Limit</option>
            <option value="name">Sort: Name (A-Z)</option>
          </select>

          <div className="flex rounded-lg border p-0.5" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2.5 py-1 rounded text-[13px] font-bold ${
                viewMode === "grid" ? "bg-[var(--card)] shadow text-[var(--accent)]" : "muted"
              }`}
              title="Card Grid View"
            >
              🗂️ Grid
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-2.5 py-1 rounded text-[13px] font-bold ${
                viewMode === "table" ? "bg-[var(--card)] shadow text-[var(--accent)]" : "muted"
              }`}
              title="Compact Table View"
            >
              📋 Table
            </button>
          </div>
        </div>
      </div>

      {/* ── CATEGORY BUDGETS DISPLAY ─────────────────────────────────────── */}
      {filteredBudgets.length === 0 ? (
        <div className="card text-center py-12 space-y-3 border border-dashed" style={{ borderColor: "var(--border)" }}>
          <div className="text-4xl">🧘</div>
          <div className="font-extrabold text-[16px]">
            {filter === "all" ? "Abhi tak koi budget set nahi kiya gaya hai" : "Is filter me koi category match nahi hui"}
          </div>
          <p className="muted text-[13px] max-w-md mx-auto">
            Food, Groceries, Petrol aur Shopping jaise regular kharchon ke liye monthly limits banayein aur paise bachayein!
          </p>
          <div className="pt-2 flex justify-center gap-2">
            <button className="btn btn-primary" onClick={() => openAddModal()}>
              ➕ Pehla Budget Set Karein
            </button>
            <button className="btn" onClick={() => setPresetModalOpen(true)}>
              ⚡ 50/30/20 Plan Apply Karein
            </button>
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* ── GRID VIEW ─────────────────────────────────────────────────── */
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBudgets.map((b) => {
            const catC = catColor(b.category);
            const isOver = b.status === "over";
            const isWarn = b.status === "warning";

            return (
              <div
                key={b.id}
                className="card fade-up !p-5 relative flex flex-col justify-between border transition duration-200 hover:shadow-lg"
                style={{
                  borderColor: isOver ? "var(--danger)" : isWarn ? "var(--warning)" : "var(--border)",
                  background: "var(--card)",
                }}
              >
                {/* Top Bar: Icon, Name & Status Badge */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl grid place-items-center text-xl shrink-0"
                        style={{ background: `color-mix(in srgb, ${catC} 15%, transparent)` }}
                      >
                        {catIcon(b.category)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-extrabold text-[15px] truncate">{b.category}</div>
                        <div className="text-[11.5px] muted">
                          Daily Allowance: <b>{inr(b.daily_budget)}/day</b>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <span
                      className="badge font-bold shrink-0"
                      style={{
                        background: isOver
                          ? "color-mix(in srgb, var(--danger) 15%, transparent)"
                          : isWarn
                          ? "color-mix(in srgb, var(--warning) 15%, transparent)"
                          : "color-mix(in srgb, var(--accent) 15%, transparent)",
                        color: isOver ? "var(--danger)" : isWarn ? "var(--warning)" : "var(--accent)",
                      }}
                    >
                      {b.pct}% Used
                    </span>
                  </div>

                  {/* Amounts: Spent vs Limit */}
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-[20px] font-extrabold mono" style={{ color: isOver ? "var(--danger)" : "var(--text)" }}>
                      {inr(b.spent)}
                    </span>
                    <span className="text-[13px] mono muted">
                      Limit: <b className="text-[var(--text)]">{inr(b.limit)}</b>
                    </span>
                  </div>

                  {/* Dynamic Progress Bar */}
                  <div className="h-2.5 w-full rounded-full overflow-hidden my-2.5" style={{ background: "var(--bg-soft)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, b.pct)}%`,
                        background: isOver ? "var(--danger)" : isWarn ? "var(--warning)" : catC,
                      }}
                    />
                  </div>

                  {/* Remaining or Over Difference Info */}
                  <div className="flex items-center justify-between text-[12px] pt-0.5">
                    {isOver ? (
                      <span className="font-bold flex items-center gap-1 text-[var(--danger)]">
                        <span>⚠️</span> Over by {inr(b.over_amount)}!
                      </span>
                    ) : (
                      <span className="font-semibold text-[var(--accent)] flex items-center gap-1">
                        <span>🛡️</span> {inr(b.remaining)} left
                      </span>
                    )}
                    <span className="muted text-[11px]">
                      Safe: <b>{inr(b.daily_safe_remaining)}/day</b>
                    </span>
                  </div>
                </div>

                {/* Bottom Actions Card Bar */}
                <div className="pt-4 mt-4 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)" }}>
                  <Link
                    to={`/expenses?cat=${b.category}`}
                    className="text-[11.5px] muted hover:text-[var(--accent)] underline"
                    title="View expenses in this category"
                  >
                    📒 View Expenses →
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <button
                      className="btn btn-sm !py-1 !px-2.5 text-[11.5px]"
                      onClick={() => openAddModal(b)}
                      title="Edit monthly limit"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="btn btn-sm !py-1 !px-2 text-[11.5px] text-[var(--danger)] hover:bg-[var(--danger)]/10"
                      onClick={() => handleDelete(b.id, b.category)}
                      title="Delete this budget"
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
        /* ── TABLE VIEW ─────────────────────────────────────────────────── */
        <div className="card !p-0 overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <tr>
                  <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Category</th>
                  <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Monthly Limit</th>
                  <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Spent So Far</th>
                  <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Progress</th>
                  <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Remaining</th>
                  <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted">Safe Pace</th>
                  <th className="py-3 px-4 font-bold text-[12px] uppercase tracking-wider muted text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {filteredBudgets.map((b) => {
                  const isOver = b.status === "over";
                  const isWarn = b.status === "warning";
                  return (
                    <tr key={b.id} className="hover:bg-[var(--card-2)] transition">
                      <td className="py-3 px-4 font-bold flex items-center gap-2">
                        <span>{catIcon(b.category)}</span>
                        <span>{b.category}</span>
                      </td>
                      <td className="py-3 px-4 mono font-semibold">{inr(b.limit)}</td>
                      <td className="py-3 px-4 mono font-extrabold" style={{ color: isOver ? "var(--danger)" : "var(--text)" }}>
                        {inr(b.spent)}
                      </td>
                      <td className="py-3 px-4 w-44">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full overflow-hidden" style={{ background: "var(--bg-soft)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, b.pct)}%`,
                                background: isOver ? "var(--danger)" : isWarn ? "var(--warning)" : "var(--accent)",
                              }}
                            />
                          </div>
                          <span className="mono text-[11px] font-bold w-10 text-right">{b.pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 mono font-semibold">
                        {isOver ? (
                          <span className="text-[var(--danger)]">+{inr(b.over_amount)} over!</span>
                        ) : (
                          <span className="text-[var(--accent)]">{inr(b.remaining)}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 mono text-[12px] muted">{inr(b.daily_safe_remaining)}/day</td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          className="btn btn-sm !py-1 !px-2"
                          onClick={() => openAddModal(b)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-sm !py-1 !px-2 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                          onClick={() => handleDelete(b.id, b.category)}
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

      {/* ── AI FORECAST & SMART RECOMMENDATIONS SECTION ──────────────────── */}
      <div className="grid lg:grid-cols-12 gap-5 pt-2">
        {/* LEFT: Holt's Trend AI Forecaster (7 cols) */}
        <div className="lg:col-span-7 card !p-6 space-y-4 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl grid place-items-center text-xl bg-[var(--bg-soft)]">
                🔮
              </div>
              <div>
                <h3 className="font-extrabold text-[16px]">Machine Learning Budget Forecaster</h3>
                <p className="muted text-[12px]">Holt’s Linear Exponential Smoothing + Seasonality Model</p>
              </div>
            </div>
            <button
              className="btn btn-sm btn-primary shadow"
              onClick={runForecast}
              disabled={forecasting}
            >
              {forecasting ? "Forecasting…" : "🤖 Run AI Forecast"}
            </button>
          </div>

          {!forecast ? (
            <div className="text-center py-6 space-y-2 muted text-[13px]">
              <div>Aapke past spending patterns ke data par trend model run karke agle mahine ka projected kharcha dekhein.</div>
              <button className="btn btn-sm mt-1" onClick={runForecast} disabled={forecasting}>
                {forecasting ? "Analyzing Data…" : "🔮 Click to Run AI Trend Model"}
              </button>
            </div>
          ) : (
            <div className="fade-up space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl p-3 text-center border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
                  <div className="muted text-[10.5px] font-bold uppercase tracking-wider">Next Month Forecast</div>
                  <div className="text-[20px] font-extrabold mono mt-1" style={{ color: "var(--accent)" }}>
                    {inr(forecast.forecast)}
                  </div>
                </div>

                <div className="rounded-xl p-3 text-center border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
                  <div className="muted text-[10.5px] font-bold uppercase tracking-wider">Confidence Range</div>
                  <div className="text-[13px] font-bold mono mt-1.5">
                    {inr(forecast.lower)} – {inr(forecast.upper)}
                  </div>
                </div>

                <div className="rounded-xl p-3 text-center border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
                  <div className="muted text-[10.5px] font-bold uppercase tracking-wider">Trend Direction</div>
                  <div className="text-[13px] font-bold mt-1.5">
                    {forecast.direction} <span className="mono">({forecast.trend_pct > 0 ? "+" : ""}{forecast.trend_pct}%)</span>
                  </div>
                </div>

                <div className="rounded-xl p-3 text-center border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
                  <div className="muted text-[10.5px] font-bold uppercase tracking-wider">Backtested Accuracy</div>
                  <div className="text-[13px] font-bold mt-1.5">
                    {forecast.mape != null ? `${Math.round(100 - forecast.mape)}%` : "Calibrating"}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl text-[12.5px] leading-relaxed flex items-center gap-2.5"
                   style={{ background: "color-mix(in srgb, var(--accent-2) 12%, transparent)" }}>
                <span className="text-xl">📊</span>
                <div>
                  <b>{forecast.message}</b>
                  <div className="muted text-[11px] mt-0.5">
                    Based on {forecast.data_points} months of transaction history · Confidence: {forecast.confidence}.
                  </div>
                </div>
              </div>

              {forecast.by_category?.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[12px] font-bold muted uppercase tracking-wider">
                    Category Projections (3-Month Moving Average):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {forecast.by_category.map((c) => (
                      <span
                        key={c.category}
                        className="badge font-semibold"
                        style={{
                          background: `color-mix(in srgb, ${catColor(c.category)} 15%, transparent)`,
                          color: catColor(c.category),
                        }}
                      >
                        {catIcon(c.category)} {c.category} · {inr(c.forecast)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Gemini AI Budget Coach (5 cols) */}
        <div className="lg:col-span-5 card !p-6 space-y-4 border" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <div>
                <h3 className="font-extrabold text-[16px]">FinMate AI Budget Coach</h3>
                <p className="muted text-[12px]">Personalized advice for your ledger</p>
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={loadAiAdvice}
              disabled={loadingAdvice}
              title="Refresh AI advice"
            >
              {loadingAdvice ? "Thinking…" : "🔄 Refresh"}
            </button>
          </div>

          <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
            {loadingAdvice ? (
              <div className="py-8 text-center muted space-y-2">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-[var(--accent)] animate-spin mx-auto" />
                <div>Gemini AI analyzing your budget limits…</div>
              </div>
            ) : aiAdvice ? (
              <div className="p-3.5 rounded-xl border" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
                {aiAdvice}
              </div>
            ) : (
              <div className="muted text-[12.5px] py-4 text-center">
                Spend discipline maintains financial peace! Track every expense to stay under budget.
              </div>
            )}
          </div>

          <div className="pt-2">
            <Link to="/chat" className="btn w-full btn-sm" style={{ background: "var(--card-2)" }}>
              💬 Chat with FinMate for Custom Budget Plan →
            </Link>
          </div>
        </div>
      </div>

      {/* ── MODAL: ADD / EDIT BUDGET ─────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 fade-up"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="card !p-6 w-full max-w-md space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{editingBudget ? "✏️" : "➕"}</span>
                <h3 className="font-extrabold text-[17px]">
                  {editingBudget ? `Edit ${editingBudget.category} Budget` : "Set Category Budget"}
                </h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full grid place-items-center muted hover:text-white hover:bg-white/10"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              {/* Category picker chips */}
              <div>
                <label className="label">Category</label>
                {editingBudget ? (
                  <div className="p-2.5 rounded-xl border flex items-center gap-2 font-bold"
                       style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    <span className="text-xl">{catIcon(formCategory)}</span>
                    <span>{formCategory}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto p-1 border rounded-xl"
                       style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    {ALL_CATEGORIES.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setFormCategory(c)}
                        className={`p-2 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition ${
                          formCategory === c
                            ? "bg-[var(--accent)] text-black font-extrabold shadow"
                            : "hover:bg-[var(--card)]"
                        }`}
                      >
                        <span>{catIcon(c)}</span>
                        <span className="truncate">{c}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Monthly Limit Input */}
              <div>
                <label className="label">Monthly Spending Limit (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold muted text-[16px]">₹</span>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    placeholder="e.g. 8000"
                    className="input mono font-extrabold text-[18px] pl-8"
                    value={formLimit}
                    onChange={(e) => setFormLimit(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Quick increment chips */}
              <div className="flex flex-wrap gap-1.5">
                {[500, 1000, 2000, 5000].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => addAmount(inc)}
                    className="btn btn-sm !py-1 !px-2.5 text-[11.5px]"
                  >
                    +{inr(inc)}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary flex-1 py-2.5 font-bold"
                  disabled={savingForm || !formLimit}
                >
                  {savingForm ? "Saving…" : editingBudget ? "Update Budget" : "Save Budget"}
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

      {/* ── MODAL: 50 / 30 / 20 AUTO-PLAN GENERATOR ──────────────────────── */}
      {presetModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 fade-up"
          onClick={() => setPresetModalOpen(false)}
        >
          <div
            className="card !p-6 w-full max-w-lg space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <div>
                  <h3 className="font-extrabold text-[17px]">Smart 50/30/20 Budget Generator</h3>
                  <p className="muted text-[11.5px]">Industry standard financial framework</p>
                </div>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full grid place-items-center muted hover:text-white hover:bg-white/10"
                onClick={() => setPresetModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Monthly Income Input */}
              <div>
                <label className="label">Monthly Take-Home Income (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold muted text-[16px]">₹</span>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    className="input mono font-extrabold text-[18px] pl-8"
                    value={presetIncome}
                    onChange={(e) => setPresetIncome(e.target.value)}
                    required
                  />
                </div>
                <div className="muted text-[11.5px] mt-1">
                  Aapke monthly income ke basis par safe budget distribution calculate hoga.
                </div>
              </div>

              {/* 50 / 30 / 20 Breakdown preview cards */}
              {parseFloat(presetIncome) > 0 && (
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div className="p-3 rounded-xl border text-center" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    <div className="text-[11px] font-bold text-[var(--accent)]">50% Needs</div>
                    <div className="text-[15px] font-extrabold mono mt-1">
                      {inr(parseFloat(presetIncome) * 0.5)}
                    </div>
                    <div className="text-[10px] muted mt-0.5">Rent, Kirana, Bills, EMI</div>
                  </div>

                  <div className="p-3 rounded-xl border text-center" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    <div className="text-[11px] font-bold text-[var(--warning)]">30% Wants</div>
                    <div className="text-[15px] font-extrabold mono mt-1">
                      {inr(parseFloat(presetIncome) * 0.3)}
                    </div>
                    <div className="text-[10px] muted mt-0.5">Dining, Shopping, Movies</div>
                  </div>

                  <div className="p-3 rounded-xl border text-center" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    <div className="text-[11px] font-bold text-[var(--accent-2)]">20% Savings</div>
                    <div className="text-[15px] font-extrabold mono mt-1">
                      {inr(parseFloat(presetIncome) * 0.2)}
                    </div>
                    <div className="text-[10px] muted mt-0.5">SIP, Emergency Fund, FD</div>
                  </div>
                </div>
              )}

              {/* Preset Rule Selector */}
              <div>
                <label className="label">Planning Model</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "50-30-20", title: "50/30/20 Rule", desc: "Balanced standard" },
                    { id: "conservative", title: "Conservative", desc: "High savings" },
                    { id: "past-average", title: "Past Average", desc: "Historical +10%" },
                  ].map((rule) => (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => setPresetRule(rule.id)}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        presetRule === rule.id
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : "border-[var(--border)]"
                      }`}
                    >
                      <div className="font-bold text-[12px]">{rule.title}</div>
                      <div className="text-[10.5px] muted mt-0.5">{rule.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary flex-1 py-3 font-bold text-[14px]"
                  onClick={handleApplyPreset}
                  disabled={applyingPreset}
                >
                  {applyingPreset ? "Applying Template…" : "⚡ Apply 50/30/20 Budget Plan Now"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPresetModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
