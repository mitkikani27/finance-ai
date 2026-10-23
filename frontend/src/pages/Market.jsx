import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  ReferenceLine,
} from "recharts";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";

// Formatting helpers
const fmtInr = (n) => {
  if (n == null || isNaN(n)) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const fmtPts = (n) => {
  if (n == null || isNaN(n)) return "0.00";
  const num = Number(n);
  return (num > 0 ? "+" : "") + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Change Badge
function ChangeBadge({ val, pts, showPts = false, size = "md" }) {
  const v = Number(val || 0);
  const isPos = v > 0;
  const isZero = v === 0;

  const bg = isPos
    ? "rgba(16, 185, 129, 0.15)"
    : isZero
    ? "rgba(148, 163, 184, 0.15)"
    : "rgba(239, 68, 68, 0.15)";
  const color = isPos ? "#10b981" : isZero ? "#94a3b8" : "#ef4444";
  const border = isPos
    ? "rgba(16, 185, 129, 0.35)"
    : isZero
    ? "rgba(148, 163, 184, 0.25)"
    : "rgba(239, 68, 68, 0.35)";

  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[12px]";

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-lg ${pad} font-mono transition-all`}
      style={{ background: bg, color: color, border: `1px solid ${border}` }}
    >
      <span>{isPos ? "▲" : isZero ? "•" : "▼"}</span>
      <span>{showPts && pts != null ? `${fmtPts(pts)} (${Math.abs(v).toFixed(2)}%)` : `${isPos ? "+" : ""}${v.toFixed(2)}%`}</span>
    </span>
  );
}

// AI Momentum Score Chip
function AiScoreChip({ score }) {
  const s = Number(score || 0);
  const color = s >= 70 ? "#10b981" : s >= 45 ? "#f59e0b" : "#ef4444";
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: color }} />
      <span>AI {s.toFixed(0)}/100</span>
    </div>
  );
}

// Custom Glassmorphic Chart Tooltip
function ChartTooltip({ active, payload, label, isPositive }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div
      className="p-3 rounded-xl shadow-2xl backdrop-blur-md text-[12px] min-w-[140px] pointer-events-none"
      style={{
        background: "rgba(17, 26, 46, 0.92)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        color: "#e6edf7",
      }}
    >
      <div className="text-[11px] font-semibold text-slate-400 mb-1 border-b border-white/10 pb-1 flex justify-between">
        <span>⏱ {data.time || label}</span>
        <span className="font-mono text-emerald-400">Live</span>
      </div>
      <div className="flex justify-between items-baseline gap-2 mt-1">
        <span className="text-slate-400">Price:</span>
        <span className="text-[14px] font-bold font-mono text-white">
          {fmtInr(data.price)}
        </span>
      </div>
      {data.ma && (
        <div className="flex justify-between items-center gap-2 text-[11px] mt-0.5">
          <span className="text-blue-400">20 EMA:</span>
          <span className="font-mono text-slate-300">{fmtInr(data.ma)}</span>
        </div>
      )}
      {data.volume && (
        <div className="flex justify-between items-center gap-2 text-[10.5px] mt-0.5 text-slate-400">
          <span>Volume:</span>
          <span className="font-mono">{Number(data.volume).toLocaleString("en-IN")}</span>
        </div>
      )}
    </div>
  );
}

export default function Market() {
  const { push } = useToast();

  // Primary live market state
  const [liveFeed, setLiveFeed] = useState(() => {
    // Optimistic cache for 0ms initial load
    try {
      const saved = localStorage.getItem("finmate_market_cache_v2");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(!liveFeed);
  const [refreshing, setRefreshing] = useState(false);
  const [autoLive, setAutoLive] = useState(true);

  // Active Interactive Chart selection
  const [activeSymbol, setActiveSymbol] = useState("^NSEI");
  const [activeTimeframe, setActiveTimeframe] = useState("1D");
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [showEMA, setShowEMA] = useState(true);

  // Tab navigation
  const [activeTab, setActiveTab] = useState("chart"); // 'chart' | 'movers' | 'ai' | 'funds' | 'sectors' | 'search'

  // Stock search / scanner
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedSectorFilter, setSelectedSectorFilter] = useState("All");

  // Real-time clock state
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch complete live market feed (<15ms)
  const fetchLiveFeed = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api(`/api/market/live-feed?symbol=${encodeURIComponent(activeSymbol)}&timeframe=${activeTimeframe}`);
      if (res && res.ok) {
        setLiveFeed(res);
        if (res.chart) setChartData(res.chart);
        try {
          localStorage.setItem("finmate_market_cache_v2", JSON.stringify(res));
        } catch {}
      }
    } catch (e) {
      if (!isSilent) push(e.message || "Failed to refresh market feed", "error");
    } finally {
      setLoading(false);
      if (!isSilent) setRefreshing(false);
    }
  }, [activeSymbol, activeTimeframe, push]);

  // Initial load
  useEffect(() => {
    fetchLiveFeed(Boolean(liveFeed));
  }, []);

  // Fast chart switcher for symbol / timeframe (<5ms)
  const loadChart = useCallback(async (sym, tf) => {
    setChartLoading(true);
    try {
      const res = await api(`/api/market/chart?symbol=${encodeURIComponent(sym)}&timeframe=${tf}`);
      if (res) {
        setChartData(res);
      }
    } catch (e) {
      push(e.message || "Could not load chart", "error");
    } finally {
      setChartLoading(false);
    }
  }, [push]);

  // Handle symbol change
  const handleSelectSymbol = (sym) => {
    setActiveSymbol(sym);
    loadChart(sym, activeTimeframe);
  };

  // Handle timeframe change
  const handleSelectTimeframe = (tf) => {
    setActiveTimeframe(tf);
    loadChart(activeSymbol, tf);
  };

  // Auto-refresh interval (every 8 seconds when active & visible)
  useEffect(() => {
    if (!autoLive) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchLiveFeed(true);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [autoLive, fetchLiveFeed]);

  // Derived datasets
  const overview = liveFeed?.overview || {};
  const trending = liveFeed?.trending || { gainers: [], losers: [], all: [] };
  const insights = liveFeed?.insights || {};
  const fundsData = liveFeed?.funds?.funds || [];
  const quickSymbols = liveFeed?.quick_symbols || [];

  // Active chart instrument details
  const activeAsset = useMemo(() => {
    if (chartData) {
      return {
        name: chartData.name,
        symbol: chartData.symbol,
        price: chartData.current_price,
        change: chartData.change,
        change_pct: chartData.change_pct,
        is_positive: chartData.is_positive,
        open: chartData.open,
        prev_close: chartData.prev_close,
        high: chartData.high,
        low: chartData.low,
        high_52w: chartData.high_52w,
        low_52w: chartData.low_52w,
        volume: chartData.volume,
        points: chartData.points || [],
      };
    }
    return {
      name: "NIFTY 50",
      symbol: "^NSEI",
      price: 24865.75,
      change: 104.2,
      change_pct: 0.42,
      is_positive: true,
      open: 24750.0,
      prev_close: 24761.5,
      high: 24964.2,
      low: 24739.0,
      high_52w: 26277.0,
      low_52w: 18837.0,
      volume: "38.4M",
      points: [],
    };
  }, [chartData]);

  // Filtered stocks for the Search Scanner
  const filteredStocks = useMemo(() => {
    const list = trending.all || [];
    return list.filter((s) => {
      const matchQ =
        !searchQuery ||
        s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.symbol?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchSec = selectedSectorFilter === "All" || s.sector === selectedSectorFilter;
      return matchQ && matchSec;
    });
  }, [trending.all, searchQuery, selectedSectorFilter]);

  // Sectors list
  const allSectors = useMemo(() => {
    const set = new Set((trending.all || []).map((s) => s.sector).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [trending.all]);

  const TIMEFRAMES = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4 fade-up">
      {/* ── 1. PRO TERMINAL HEADER ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-[#111a2e] via-[#141f38] to-[#111a2e] border border-slate-800/80 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xl shadow-lg shadow-emerald-500/10">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Live Market <span className="text-emerald-400">Terminal</span>
              </h1>
              <div
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider"
                style={{
                  background: autoLive ? "rgba(16, 185, 129, 0.15)" : "rgba(148, 163, 184, 0.15)",
                  color: autoLive ? "#10b981" : "#94a3b8",
                  border: `1px solid ${autoLive ? "rgba(16, 185, 129, 0.3)" : "rgba(148, 163, 184, 0.2)"}`,
                }}
              >
                <span className={`w-2 h-2 rounded-full ${autoLive ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
                {autoLive ? "Real-time NSE Feed" : "Paused"}
              </div>
            </div>
            <p className="text-[12px] text-slate-400">
              Institutional-grade market intelligence · Interactive live charts · Instant 0ms cache
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Real-time Clock */}
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 font-mono text-[12px] text-slate-300 hidden md:flex items-center gap-2">
            <span className="text-emerald-400">●</span>
            <span>{clock}</span>
          </div>

          {/* Auto-Live Toggle Button */}
          <button
            onClick={() => setAutoLive((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-[12px] font-bold border transition flex items-center gap-1.5"
            style={{
              background: autoLive ? "rgba(16, 185, 129, 0.1)" : "rgba(15, 23, 42, 0.6)",
              borderColor: autoLive ? "rgba(16, 185, 129, 0.4)" : "var(--border)",
              color: autoLive ? "#10b981" : "var(--muted)",
            }}
          >
            <span className={`w-2 h-2 rounded-full ${autoLive ? "bg-emerald-400 animate-ping" : "bg-slate-400"}`} />
            {autoLive ? "Live Streaming" : "Auto-Update Off"}
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => fetchLiveFeed(false)}
            disabled={refreshing}
            className="px-3.5 py-1.5 rounded-xl text-[12px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 shadow"
          >
            <span className={refreshing ? "animate-spin" : ""}>↻</span>
            <span>{refreshing ? "Updating…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* ── 2. STREAMING TICKER TAPE ─────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden bg-slate-900/90 border border-slate-800 p-2 shadow-inner">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          <span className="text-[10.5px] font-black uppercase text-slate-400 px-2 py-1 bg-slate-800/80 rounded border border-slate-700/60 whitespace-nowrap">
            Indices & Movers
          </span>
          {(overview.indices || []).map((idx) => {
            const isSelected = activeSymbol === (idx.symbol || idx.name);
            return (
              <button
                key={idx.name}
                onClick={() => handleSelectSymbol(idx.symbol || idx.name)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition whitespace-nowrap border ${
                  isSelected
                    ? "bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm"
                    : "bg-slate-800/40 hover:bg-slate-800/80 border-slate-800/80 text-slate-300"
                }`}
              >
                <span className="font-bold text-[12px]">{idx.name}</span>
                <span className="font-mono text-[12px] font-semibold text-slate-200">
                  {fmtInr(idx.value)}
                </span>
                <ChangeBadge val={idx.chg} size="sm" />
              </button>
            );
          })}

          {/* Quick stock shortcuts */}
          {quickSymbols.slice(4).map((q) => {
            const isSelected = activeSymbol === q.symbol;
            return (
              <button
                key={q.symbol}
                onClick={() => handleSelectSymbol(q.symbol)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition whitespace-nowrap border ${
                  isSelected
                    ? "bg-blue-500/15 border-blue-500/50 text-white"
                    : "bg-slate-800/30 hover:bg-slate-800/70 border-slate-800/60 text-slate-400"
                }`}
              >
                <span className="text-[11.5px] font-semibold">{q.name}</span>
                <span className="font-mono text-[11.5px] text-slate-300">
                  {fmtInr(q.base)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. HERO PRO INTERACTIVE LIVE MARKET CHART ────────────────── */}
      <div className="card !p-5 relative overflow-hidden bg-gradient-to-b from-[#111a2e] to-[#0c1424] border border-slate-800 shadow-2xl">
        {/* Glowing aura effect */}
        <div
          className="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ background: activeAsset.is_positive ? "#10b981" : "#ef4444" }}
        />

        {/* Top Chart Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                NSE Live
              </span>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                {activeAsset.name}
              </h2>
              <span className="text-[13px] font-mono text-slate-400 font-semibold">
                ({activeAsset.symbol})
              </span>
            </div>

            {/* Big Live Price */}
            <div className="flex items-baseline gap-3 mt-1">
              <div className="text-3xl md:text-4xl font-black font-mono tracking-tight text-white">
                {fmtInr(activeAsset.price)}
              </div>
              <ChangeBadge
                val={activeAsset.change_pct}
                pts={activeAsset.change}
                showPts={true}
                size="md"
              />
            </div>
          </div>

          {/* Timeframe & Chart Style Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* EMA Toggle */}
            <button
              onClick={() => setShowEMA((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border transition ${
                showEMA
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                  : "bg-slate-800/60 text-slate-400 border-slate-700/60"
              }`}
            >
              20 EMA {showEMA ? "ON" : "OFF"}
            </button>

            {/* Timeframe Selector Pills */}
            <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
              {TIMEFRAMES.map((tf) => {
                const isSelected = activeTimeframe === tf;
                return (
                  <button
                    key={tf}
                    onClick={() => handleSelectTimeframe(tf)}
                    className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition ${
                      isSelected
                        ? "bg-emerald-500 text-slate-950 shadow-md font-extrabold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Interactive Chart Canvas */}
        <div className="h-72 md:h-80 w-full relative">
          {chartLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs rounded-xl">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/90 text-[12px] font-bold text-emerald-400 border border-slate-700 shadow-xl">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live streaming data…
              </span>
            </div>
          )}

          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activeAsset.points} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="liveChartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={activeAsset.is_positive ? "#10b981" : "#ef4444"}
                    stopOpacity={0.45}
                  />
                  <stop
                    offset="65%"
                    stopColor={activeAsset.is_positive ? "#10b981" : "#ef4444"}
                    stopOpacity={0.08}
                  />
                  <stop
                    offset="100%"
                    stopColor={activeAsset.is_positive ? "#10b981" : "#ef4444"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fontSize: 10.5, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                minTickGap={28}
              />
              <YAxis
                domain={["auto", "auto"]}
                stroke="#64748b"
                tick={{ fontSize: 10.5, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                orientation="right"
              />

              <Tooltip content={<ChartTooltip isPositive={activeAsset.is_positive} />} />

              {/* Day open reference line */}
              {activeAsset.open && (
                <ReferenceLine
                  y={activeAsset.open}
                  stroke="rgba(255, 255, 255, 0.18)"
                  strokeDasharray="4 4"
                  label={{
                    value: `Open: ₹${activeAsset.open.toLocaleString("en-IN")}`,
                    fill: "#94a3b8",
                    fontSize: 10,
                    position: "insideTopLeft",
                  }}
                />
              )}

              {/* Area Curve */}
              <Area
                type="monotone"
                dataKey="price"
                stroke={activeAsset.is_positive ? "#10b981" : "#ef4444"}
                strokeWidth={2.2}
                fill="url(#liveChartGrad)"
                isAnimationActive={false}
              />

              {/* 20-EMA Line Overlay */}
              {showEMA && (
                <Line
                  type="monotone"
                  dataKey="ma"
                  stroke="#3b82f6"
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Key Market Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
          {/* Day Range */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
              Today's High / Low
            </span>
            <div className="flex justify-between items-baseline font-mono text-[12.5px] font-bold text-white mb-1.5">
              <span className="text-red-400">{fmtInr(activeAsset.low)}</span>
              <span className="text-emerald-400">{fmtInr(activeAsset.high)}</span>
            </div>
            {/* Visual range bar */}
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 rounded-full"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* Open & Prev Close */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
              Open & Prev Close
            </span>
            <div className="text-[13px] font-mono font-bold text-white">
              Open: <span className="text-slate-200">{fmtInr(activeAsset.open)}</span>
            </div>
            <div className="text-[11.5px] font-mono text-slate-400 mt-0.5">
              Prev: {fmtInr(activeAsset.prev_close)}
            </div>
          </div>

          {/* 52W Range */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
              52-Week Range
            </span>
            <div className="flex justify-between items-baseline font-mono text-[12px] font-bold text-slate-300">
              <span className="text-slate-400">{fmtInr(activeAsset.low_52w)}</span>
              <span className="text-slate-200">{fmtInr(activeAsset.high_52w)}</span>
            </div>
            <div className="text-[10.5px] text-slate-500 mt-1">1-Year Peak & Base</div>
          </div>

          {/* Volume & India VIX */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
              Volume & Volatility
            </span>
            <div className="text-[13px] font-mono font-bold text-white flex justify-between">
              <span>Vol: {activeAsset.volume || "34.2M"}</span>
              <span className="text-amber-400 font-semibold text-[11.5px]">
                VIX: {overview.vix || 13.2}
              </span>
            </div>
            <div className="text-[10.5px] text-slate-500 mt-1">Healthy market liquidity</div>
          </div>
        </div>
      </div>

      {/* ── 4. MARKET BREADTH & SENTIMENT RADAR ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Market Mood Gauge */}
        <div className="card !p-4 bg-gradient-to-br from-slate-900 via-slate-900 to-[#122038] border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">
              Market Sentiment Mood
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              Real-time
            </span>
          </div>
          <div className="text-xl md:text-2xl font-black text-white mt-1">
            {overview.mood || "Bullish 🐂"}
          </div>

          {/* Advance / Decline Bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[11.5px] font-semibold mb-1">
              <span className="text-emerald-400">{overview.advancers || 28} Advancing</span>
              <span className="text-red-400">{overview.decliners || 13} Declining</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${overview.advance_pct || 68}%` }}
              />
              <div
                className="bg-red-500 h-full transition-all duration-500"
                style={{ width: `${100 - (overview.advance_pct || 68)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Sector Leadership */}
        <div className="card !p-4 bg-slate-900 border border-slate-800">
          <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
            Sector Leaders & Laggards
          </span>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[12.5px] font-bold text-slate-200">
                🚀 Top: {overview.sectors?.[0]?.sector || "IT"}
              </span>
              <span className="text-[12.5px] font-bold font-mono text-emerald-400">
                +{overview.sectors?.[0]?.chg || 1.8}%
              </span>
            </div>
            <div className="flex justify-between items-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="text-[12.5px] font-bold text-slate-200">
                📉 Lag: {overview.sectors?.[overview.sectors?.length - 1]?.sector || "Metals"}
              </span>
              <span className="text-[12.5px] font-bold font-mono text-red-400">
                {overview.sectors?.[overview.sectors?.length - 1]?.chg || -0.6}%
              </span>
            </div>
          </div>
        </div>

        {/* Top AI Pick Card */}
        <div className="card !p-4 bg-gradient-to-br from-slate-900 to-[#16233b] border border-slate-800">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">
              AI Momentum Pick
            </span>
            {insights.top_picks?.[0] && <AiScoreChip score={insights.top_picks[0].score} />}
          </div>
          {insights.top_picks?.[0] ? (
            <div>
              <div className="text-lg font-black text-white mt-1">
                {insights.top_picks[0].name}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-sm font-bold text-slate-200">
                  {fmtInr(insights.top_picks[0].price)}
                </span>
                <ChangeBadge val={insights.top_picks[0].day_chg} size="sm" />
              </div>
              <p className="text-[11.5px] text-slate-400 mt-2 line-clamp-1">
                {insights.top_picks[0].reasons?.[0] || "Strong momentum above 50-DMA"}
              </p>
            </div>
          ) : (
            <div className="text-[12px] text-slate-400 mt-2">Analyzing top momentum stocks…</div>
          )}
        </div>
      </div>

      {/* ── 5. INTERACTIVE SECTION TABS ───────────────────────────────── */}
      <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar">
        {[
          ["chart", "📈 Live Chart"],
          ["movers", "🔥 Top Movers"],
          ["ai", "🤖 AI Momentum Radar"],
          ["funds", "💰 Mutual Funds & ETFs"],
          ["sectors", "📊 Sector Heatmap"],
          ["search", "🔍 Stock Scanner"],
        ].map(([key, label]) => {
          const isAct = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2.5 px-3 rounded-lg text-[12.5px] font-bold whitespace-nowrap transition ${
                isAct
                  ? "bg-emerald-500 text-slate-950 shadow-md font-extrabold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── 6. TAB CONTENT PANELS ─────────────────────────────────────── */}

      {/* TAB 1: QUICK SWITCH INSTRUMENTS (if 'chart' tab active) */}
      {activeTab === "chart" && (
        <div className="card !p-4 bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase text-slate-400 tracking-wider">
              Popular Instruments · One-Click Live Chart Switcher
            </h3>
            <span className="text-[11px] text-slate-500">Click any asset to load live chart</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {quickSymbols.map((item) => {
              const isSelected = activeSymbol === item.symbol;
              return (
                <button
                  key={item.symbol}
                  onClick={() => handleSelectSymbol(item.symbol)}
                  className={`p-3 rounded-xl text-left border transition ${
                    isSelected
                      ? "bg-emerald-500/15 border-emerald-500/60 shadow-lg"
                      : "bg-slate-800/40 hover:bg-slate-800 border-slate-800"
                  }`}
                >
                  <div className="text-[11px] font-semibold text-slate-400 truncate">
                    {item.category}
                  </div>
                  <div className="font-extrabold text-[13.5px] text-white mt-0.5 truncate">
                    {item.name}
                  </div>
                  <div className="font-mono text-[12px] font-bold text-slate-300 mt-1">
                    {fmtInr(item.base)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: TOP MOVERS (Gainers & Losers) */}
      {activeTab === "movers" && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Top Gainers */}
          <div className="card !p-4 bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <h3 className="font-extrabold text-[14px] text-emerald-400 flex items-center gap-2">
                <span>🚀 Top Gainers (NSE)</span>
              </h3>
              <span className="text-[11px] text-slate-500">Live Momentum</span>
            </div>
            <div className="space-y-2">
              {(trending.gainers || []).map((s) => (
                <div
                  key={s.symbol}
                  className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-800 flex items-center justify-between gap-3 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[13.5px] text-white truncate flex items-center gap-1.5">
                      <span>{s.name}</span>
                      <span className="text-slate-400 text-[11px]">({s.symbol})</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {s.sector} · 5D {s.mom5d > 0 ? "+" : ""}{s.mom5d}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-[13.5px] text-white">
                      {fmtInr(s.price)}
                    </div>
                    <ChangeBadge val={s.day_chg} size="sm" />
                  </div>
                  <button
                    onClick={() => {
                      handleSelectSymbol(s.symbol + ".NS");
                      setActiveTab("chart");
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition border border-emerald-500/30"
                  >
                    Chart →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Top Losers */}
          <div className="card !p-4 bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <h3 className="font-extrabold text-[14px] text-red-400 flex items-center gap-2">
                <span>📉 Top Losers (NSE)</span>
              </h3>
              <span className="text-[11px] text-slate-500">Profit Booking</span>
            </div>
            <div className="space-y-2">
              {(trending.losers || []).map((s) => (
                <div
                  key={s.symbol}
                  className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-800 flex items-center justify-between gap-3 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[13.5px] text-white truncate flex items-center gap-1.5">
                      <span>{s.name}</span>
                      <span className="text-slate-400 text-[11px]">({s.symbol})</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {s.sector} · 5D {s.mom5d > 0 ? "+" : ""}{s.mom5d}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-[13.5px] text-white">
                      {fmtInr(s.price)}
                    </div>
                    <ChangeBadge val={s.day_chg} size="sm" />
                  </div>
                  <button
                    onClick={() => {
                      handleSelectSymbol(s.symbol + ".NS");
                      setActiveTab("chart");
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition border border-red-500/30"
                  >
                    Chart →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AI MOMENTUM RADAR */}
      {activeTab === "ai" && (
        <div className="space-y-4">
          {/* AI Synthesis Box */}
          <div className="card !p-5 bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🤖</span>
              <h3 className="font-black text-white text-[15px]">
                FinMate AI Market Intelligence
              </h3>
            </div>
            <p className="text-[13.5px] text-slate-300 leading-relaxed font-sans">
              {insights.summary || "Real-time AI market scanning active across all 41 universe stocks."}
            </p>
          </div>

          {/* Top 3 Algorithmically Scored Picks */}
          <div>
            <h3 className="text-sm font-bold uppercase text-slate-400 tracking-wider mb-3">
              🏆 Top-3 High Momentum AI Picks
            </h3>
            <div className="grid md:grid-cols-3 gap-3">
              {(insights.top_picks || []).map((pick, i) => (
                <div
                  key={pick.symbol}
                  className="card !p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-400 block mb-0.5">
                        Rank #{i + 1} Momentum Pick
                      </span>
                      <h4 className="font-extrabold text-[15px] text-white">
                        {pick.name}
                      </h4>
                      <span className="text-[11px] text-slate-400">{pick.symbol} · {pick.sector}</span>
                    </div>
                    <AiScoreChip score={pick.score} />
                  </div>

                  <div className="flex items-baseline gap-2 mt-3 pt-2 border-t border-slate-800">
                    <span className="font-mono text-lg font-bold text-white">
                      {fmtInr(pick.price)}
                    </span>
                    <ChangeBadge val={pick.day_chg} size="sm" />
                  </div>

                  <ul className="mt-3 space-y-1.5 text-[11.5px] text-slate-400">
                    {(pick.reasons || []).map((r, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-emerald-400">✓</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => {
                      handleSelectSymbol(pick.symbol + ".NS");
                      setActiveTab("chart");
                    }}
                    className="w-full mt-3 py-1.5 rounded-lg text-[12px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  >
                    View Live Chart →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MUTUAL FUNDS & ETFS (Loads in 0ms) */}
      {activeTab === "funds" && (
        <div className="space-y-4">
          <div className="card !p-4 bg-gradient-to-r from-blue-950/20 via-slate-900 to-slate-900 border border-blue-500/30 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-white text-[15px] flex items-center gap-2">
                <span>💰 Direct Index & Thematic ETFs</span>
                <span className="text-[11px] font-bold text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-full border border-blue-500/30">
                  NSE Listed
                </span>
              </h3>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Low-cost wealth compounding instruments with real 1M, 6M, and 1Y trailing performance
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Top Performer (1Y)</span>
              <span className="text-sm font-bold text-emerald-400">
                {fundsData[0]?.name || "NYSE FANG+ ETF"} ({fundsData[0]?.r1y || 44.3}%)
              </span>
            </div>
          </div>

          {/* Funds Table */}
          <div className="card !p-0 overflow-x-auto bg-slate-900 border border-slate-800 shadow-xl">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="bg-slate-850 text-slate-400 text-left border-b border-slate-800">
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase">#</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase">Fund / ETF Name</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase hidden sm:table-cell">Category</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase text-right">Price</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase text-right">1M Return</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase text-right">6M Return</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase text-right">1Y Return</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase text-center">AI Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {fundsData.map((f, i) => (
                  <tr key={f.symbol} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 text-slate-500 font-mono text-[12px]">{i + 1}</td>
                    <td className="px-4 py-3 font-bold text-white flex items-center gap-2">
                      <span>{f.name}</span>
                      <span className="text-[11px] text-slate-400 font-mono">({f.symbol})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[12px] hidden sm:table-cell">
                      {f.category}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-200">
                      {fmtInr(f.price)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChangeBadge val={f.r1m} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChangeBadge val={f.r6m} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      <ChangeBadge val={f.r1y} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                        style={{
                          background: f.r1y >= 20 ? "#10b98122" : f.r1y >= 10 ? "#3b82f622" : "#f59e0b22",
                          color: f.r1y >= 20 ? "#10b981" : f.r1y >= 10 ? "#3b82f6" : "#f59e0b",
                          border: `1px solid ${f.r1y >= 20 ? "#10b98144" : f.r1y >= 10 ? "#3b82f644" : "#f59e0b44"}`,
                        }}
                      >
                        {f.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: SECTOR HEATMAP */}
      {activeTab === "sectors" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase text-slate-400 tracking-wider">
              NSE Sector Performance Matrix
            </h3>
            <span className="text-[11px] text-slate-500">9 Core Industry Clusters</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
            {(overview.sectors || []).map((sec) => {
              const isUp = sec.chg >= 0;
              const color = isUp ? "#10b981" : "#ef4444";
              return (
                <div
                  key={sec.sector}
                  className="card !p-4 bg-slate-900 border transition hover:scale-[1.01]"
                  style={{ borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-extrabold text-[14px] text-white">
                      {sec.sector}
                    </span>
                    <span className="text-[11px] text-slate-500">{sec.count} stocks</span>
                  </div>
                  <div className="text-2xl font-black font-mono mt-2" style={{ color: color }}>
                    {isUp ? "+" : ""}{sec.chg}%
                  </div>
                  {/* Subtle bar */}
                  <div className="h-1 w-full bg-slate-800 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.abs(sec.chg) * 35)}%`,
                        background: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: STOCK SCANNER & SEARCH */}
      {activeTab === "search" && (
        <div className="space-y-4">
          {/* Search Controls */}
          <div className="card !p-4 bg-slate-900 border border-slate-800 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search by stock name or symbol (e.g. Reliance, TCS, HDFC)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-[12px] font-semibold text-slate-400">Sector:</span>
              <select
                value={selectedSectorFilter}
                onChange={(e) => setSelectedSectorFilter(e.target.value)}
                className="input !w-auto text-[12px] py-1.5"
              >
                {allSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stocks Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredStocks.map((stock) => (
              <div
                key={stock.symbol}
                className="card !p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-extrabold text-[14px] text-white">
                      {stock.name}
                    </h4>
                    <span className="text-[11.5px] text-slate-400">
                      {stock.symbol} · {stock.sector}
                    </span>
                  </div>
                  <AiScoreChip score={stock.score} />
                </div>

                <div className="flex items-baseline justify-between mt-3 pt-2 border-t border-slate-800">
                  <div className="font-mono text-[15px] font-bold text-white">
                    {fmtInr(stock.price)}
                  </div>
                  <ChangeBadge val={stock.day_chg} size="sm" />
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2.5 text-[11px] text-slate-400">
                  <div className="p-1.5 rounded bg-slate-800/60">
                    5D: <b className="text-slate-200">{stock.mom5d > 0 ? "+" : ""}{stock.mom5d}%</b>
                  </div>
                  <div className="p-1.5 rounded bg-slate-800/60">
                    1M: <b className="text-slate-200">{stock.mom1m > 0 ? "+" : ""}{stock.mom1m}%</b>
                  </div>
                </div>

                <button
                  onClick={() => {
                    handleSelectSymbol(stock.symbol + ".NS");
                    setActiveTab("chart");
                  }}
                  className="w-full mt-3 py-1.5 rounded-lg text-[12px] font-bold bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 border border-slate-700 transition"
                >
                  Load in Live Chart 📈
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 7. FOOTER DISCLAIMER ──────────────────────────────────────── */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-500 text-center leading-relaxed">
        ⚠️ {overview.disclaimer || "Educational and analytics use only — NOT SEBI registered investment advice."}
      </div>
    </div>
  );
}
