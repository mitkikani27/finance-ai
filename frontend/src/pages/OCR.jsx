import React, { useRef, useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, getStoredToken } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, today } from "../format.js";

const imgSrc = (id) => `/api/ocr/image/${id}?_auth=${encodeURIComponent(getStoredToken() || "")}`;

const CATEGORIES = [
  "Food", "Groceries", "Fuel", "Rent", "EMI", "Medical",
  "Transport", "Entertainment", "Shopping", "Utilities",
  "Education", "Travel", "Other"
];

const PAYMENT_MODES = ["UPI", "Card", "Cash", "NetBanking", "Other"];

// Supported international currencies with live exchange rates to INR
const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee", flag: "🇮🇳", defaultRate: 1.0 },
  { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", defaultRate: 86.80 },
  { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺", defaultRate: 93.40 },
  { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧", defaultRate: 111.50 },
  { code: "AED", symbol: "AED", name: "UAE Dirham", flag: "🇦🇪", defaultRate: 23.63 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", flag: "🇨🇦", defaultRate: 62.10 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺", defaultRate: 56.40 },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬", defaultRate: 64.90 },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal", flag: "🇸🇦", defaultRate: 23.14 },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵", defaultRate: 0.57 },
];

export default function OCR() {
  const { push } = useToast();
  const { t } = useLang();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const [img, setImg] = useState(null);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [scanStep, setScanStep] = useState(1);
  const [previewModal, setPreviewModal] = useState(null);

  // Currency & Auto-Conversion State
  const [currency, setCurrency] = useState("INR");
  const [currencySymbol, setCurrencySymbol] = useState("₹");
  const [originalAmount, setOriginalAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("86.80");
  const [isForeign, setIsForeign] = useState(false);
  const [customRateActive, setCustomRateActive] = useState(false);

  // Form State
  const [form, setForm] = useState({
    shop: "",
    amount: "",        // Final Amount in INR (saved to DB)
    tax: "0",          // Final Tax in INR
    date: today(),
    category: "Shopping",
    payment_mode: "Card",
    description: "",
  });

  const setField = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  // Load recent scans
  const loadRecent = useCallback(() => {
    api("/api/ocr/recent").then(setRecent).catch(() => {});
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // Recalculate converted INR amount whenever originalAmount or exchangeRate changes
  const updateConvertedInr = useCallback((origAmtStr, rateStr, curr) => {
    const orig = parseFloat(origAmtStr);
    const rate = parseFloat(rateStr) || 1.0;

    if (curr === "INR") {
      setForm((p) => ({ ...p, amount: isNaN(orig) ? "" : String(orig) }));
      return;
    }

    if (!isNaN(orig) && orig > 0) {
      const converted = Math.round(orig * rate * 100) / 100;
      setForm((p) => ({ ...p, amount: String(converted) }));
    }
  }, []);

  // When currency dropdown changes
  const handleCurrencyChange = (newCurr) => {
    setCurrency(newCurr);
    const item = CURRENCIES.find((c) => c.code === newCurr) || CURRENCIES[0];
    setCurrencySymbol(item.symbol);
    const newRate = String(item.defaultRate);
    setExchangeRate(newRate);
    const foreign = newCurr !== "INR";
    setIsForeign(foreign);
    updateConvertedInr(originalAmount || form.amount, newRate, newCurr);
  };

  // Populate data when OCR / AI scan succeeds
  const populateScanResult = (r) => {
    setResult(r);
    const detectedCat = r.category || r.ai_category || "Shopping";

    // Detect currency from response
    const detCurr = (r.original_currency || (r.currency === "USD" ? "USD" : "INR")).toUpperCase();
    const currItem = CURRENCIES.find((c) => c.code === detCurr) || CURRENCIES[0];

    const foreign = detCurr !== "INR" || Boolean(r.is_foreign_currency);
    const rate = r.exchange_rate ? String(r.exchange_rate) : String(currItem.defaultRate);
    const origAmt = r.original_amount != null ? String(r.original_amount) : (r.amount ? String(r.amount) : "");

    setCurrency(detCurr);
    setCurrencySymbol(r.currency_symbol || currItem.symbol);
    setExchangeRate(rate);
    setIsForeign(foreign);
    setOriginalAmount(origAmt);

    // Final converted INR amount
    const inrAmt = r.amount ? String(r.amount) : origAmt;

    setForm({
      shop: r.shop || "Receipt",
      amount: inrAmt,
      tax: r.tax ? String(r.tax) : "0",
      date: r.date || today(),
      category: CATEGORIES.includes(detectedCat) ? detectedCat : "Shopping",
      payment_mode: r.payment_mode || "Card",
      description: foreign && origAmt
        ? `${r.shop || "Store"} (${currItem.symbol}${origAmt} ${detCurr} @ ₹${rate})`
        : `Receipt: ${r.shop || "Store"}`,
    });

    if (foreign) {
      push(`✨ Foreign receipt detected in ${detCurr}! Automatically converted to Indian Rupees (₹).`, "info");
    } else {
      push("✨ AI ne receipt scan karke details auto-fetch kar li!", "success");
    }
  };

  function onFile(f) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      push("Kripya image file (JPG ya PNG) upload karein.", "error");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      push("Image size max 10 MB allowed hai.", "error");
      return;
    }

    setSaved(null);
    setImg(URL.createObjectURL(f));
    setResult(null);
    setBusy(true);
    setScanStep(1);

    const stepTimer = setInterval(() => {
      setScanStep((s) => (s < 3 ? s + 1 : s));
    }, 900);

    const fd = new FormData();
    fd.append("file", f);

    api("/api/ocr/upload", { method: "POST", body: fd })
      .then((r) => {
        populateScanResult(r);
        loadRecent();
      })
      .catch((e) => {
        push(e.message || "Receipt scan fail ho gaya. Kripya dobara try karein.", "error");
      })
      .finally(() => {
        clearInterval(stepTimer);
        setBusy(false);
      });
  }

  // Scan Indian Sample
  async function onSample() {
    setSaved(null);
    setResult(null);
    setBusy(true);
    setScanStep(2);

    const stepTimer = setInterval(() => {
      setScanStep((s) => (s < 3 ? s + 1 : s));
    }, 800);

    try {
      const r = await api("/api/ocr/sample", { method: "POST" });
      if (r.id) setImg(imgSrc(r.id));
      populateScanResult(r);
      loadRecent();
    } catch (e) {
      push(e.message || "Sample scan failed", "error");
    } finally {
      clearInterval(stepTimer);
      setBusy(false);
    }
  }

  // Scan US Dollar Sample (Auto-converts $ to ₹)
  async function onSampleUSD() {
    setSaved(null);
    setResult(null);
    setBusy(true);
    setScanStep(2);

    const stepTimer = setInterval(() => {
      setScanStep((s) => (s < 3 ? s + 1 : s));
    }, 800);

    try {
      const r = await api("/api/ocr/sample-usd", { method: "POST" });
      if (r.id) setImg(imgSrc(r.id));
      populateScanResult(r);
      loadRecent();
    } catch (e) {
      push(e.message || "USD Sample scan failed", "error");
    } finally {
      clearInterval(stepTimer);
      setBusy(false);
    }
  }

  // Confirm and Save to Database as Expense (Stored in INR with Currency Metadata)
  async function confirmAdd() {
    if (!result?.id) return;
    const numAmt = parseFloat(form.amount);
    if (!numAmt || numAmt <= 0) {
      push("Kripya valid amount enter karein.", "error");
      return;
    }

    setBusy(true);
    try {
      const r = await api(`/api/ocr/confirm/${result.id}`, {
        method: "POST",
        body: {
          shop: form.shop,
          amount: numAmt,                                 // Converted INR amount
          tax: parseFloat(form.tax) || 0,
          date: form.date,
          category: form.category || "Shopping",
          payment_mode: form.payment_mode || "Card",
          description: form.description || `Receipt: ${form.shop}`,
          original_amount: isForeign ? (parseFloat(originalAmount) || numAmt) : numAmt,
          original_currency: currency,
          exchange_rate: isForeign ? (parseFloat(exchangeRate) || 1.0) : 1.0,
          currency_symbol: currencySymbol,
        },
      });

      setSaved({
        ...r,
        receipt_id: result.id,
        shop: form.shop,
        is_foreign: isForeign,
        original_amount: originalAmount,
        original_currency: currency,
        currency_symbol: currencySymbol,
        exchange_rate: exchangeRate,
      });
      setResult(null);
      push(`✅ ${inr(r.amount)} ki expense successfully add ho gayi!`, "success");
      loadRecent();
    } catch (e) {
      push(e.message || "Expense save nahi ho payi.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecent(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Is scan record ko delete karein?")) return;
    try {
      await api(`/api/ocr/${id}`, { method: "DELETE" });
      setRecent((list) => list.filter((r) => r.id !== id));
      push("Scan delete ho gayi.", "success");
    } catch (err) {
      push(err.message, "error");
    }
  }

  return (
    <div className="space-y-6 max-w-[1180px] mx-auto pb-10 fade-up">
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-[#111a2e] via-[#141f38] to-[#111a2e] border border-slate-800 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11.5px] font-bold mb-2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span>⚡ Multi-Currency AI Scanner</span>
            <span>·</span>
            <span>Auto-Convert $ to ₹</span>
          </div>
          <h1 className="text-[24px] font-black tracking-tight text-white flex items-center gap-2">
            <span>🧾</span> {t("ocr")} & Auto-Expense
          </h1>
          <p className="text-slate-400 text-[13px] mt-0.5">
            Bill ya receipt upload karo — AI automatic Shop, Date, Tax aur <b>Dollar / Foreign Currency ko Indian Rupee (₹) me convert</b> karke expense add kar dega!
          </p>
        </div>

        {/* Quick action shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          {/* US Dollar Sample Bill button */}
          <button
            className="btn btn-sm"
            onClick={onSampleUSD}
            disabled={busy}
            style={{
              background: "rgba(59, 130, 246, 0.15)",
              borderColor: "rgba(59, 130, 246, 0.4)",
              color: "#60a5fa",
            }}
            title="US Dollar ($48.50) receipt scan karke INR conversion test karein"
          >
            🇺🇸 Try Dollar Bill ($)
          </button>

          {/* Indian Sample Bill button */}
          <button
            className="btn btn-sm"
            onClick={onSample}
            disabled={busy}
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              borderColor: "rgba(16, 185, 129, 0.4)",
              color: "#10b981",
            }}
            title="Fast Food Indian Rupee receipt scan karein"
          >
            🇮🇳 Try Indian Bill (₹)
          </button>

          <button
            className="btn btn-sm"
            onClick={() => cameraRef.current?.click()}
            title="Camera se photo khincho"
          >
            📸 Camera
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => fileRef.current?.click()}
            title="File chuno"
          >
            📁 Upload Bill
          </button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files[0])}
      />

      {/* ── SUCCESS BANNER ───────────────────────────────────────────────── */}
      {saved && (
        <div
          className="card fade-up border-2 bg-emerald-950/20 border-emerald-500 shadow-2xl"
        >
          <div className="flex flex-wrap items-center gap-4">
            {saved.receipt_id && (
              <img
                src={imgSrc(saved.receipt_id)}
                alt="Receipt"
                className="h-20 w-20 object-cover rounded-xl border border-slate-700 cursor-pointer hover:opacity-90 transition shadow-md"
                onClick={() => setPreviewModal(imgSrc(saved.receipt_id))}
                title="Bada dekhne ke liye click karo"
              />
            )}
            <div className="flex-1 min-w-[240px]">
              <div className="text-[12px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span>🎉 Expense Successfully Saved to Database</span>
                {saved.is_foreign && (
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    Auto-Converted from {saved.currency_symbol}{saved.original_amount} {saved.original_currency}
                  </span>
                )}
              </div>
              <div className="font-extrabold text-[20px] text-white mt-0.5 font-mono">
                {inr(saved.amount)} <span className="text-[14px] font-sans text-slate-300">· {saved.shop || "Receipt"}</span>
              </div>
              <div className="text-[12px] text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span>Category: <b className="text-slate-200">{saved.category}</b></span>
                <span>·</span>
                <span>Date: <b className="text-slate-200">{saved.date}</b></span>
                {saved.is_foreign && (
                  <>
                    <span>·</span>
                    <span>Rate: <b className="text-emerald-400">1 {saved.original_currency} = ₹{saved.exchange_rate}</b></span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link className="btn btn-primary" to={`/expenses?month=${saved.month}`}>
                📒 Expenses me dekho →
              </Link>
              <button
                className="btn"
                onClick={() => {
                  setSaved(null);
                  setImg(null);
                  setResult(null);
                  fileRef.current?.click();
                }}
              >
                ➕ Nayi Receipt Scan Karo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN WORKSPACE ──────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Upload Zone / Receipt Image Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div
            className={`card border-2 border-dashed relative overflow-hidden flex flex-col items-center justify-center min-h-[360px] text-center p-6 transition-all ${
              busy ? "pulse" : "cursor-pointer hover:border-[var(--accent)]"
            }`}
            style={{
              borderColor: img ? "var(--accent)" : "var(--border)",
              background: "var(--card)",
            }}
            onClick={() => !busy && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
            }}
          >
            {img ? (
              <div className="w-full relative group">
                <img
                  src={img}
                  alt="Uploaded receipt"
                  className="max-h-[380px] w-full object-contain rounded-xl mx-auto shadow-lg"
                />
                {!busy && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-xl flex items-center justify-center gap-2 backdrop-blur-xs">
                    <button
                      type="button"
                      className="btn btn-sm glass text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewModal(img);
                      }}
                    >
                      🔍 Zoom
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileRef.current?.click();
                      }}
                    >
                      🔄 Change Photo
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 py-6">
                <div
                  className="w-16 h-16 rounded-2xl grid place-items-center text-3xl mx-auto shadow-xl"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    color: "#fff",
                  }}
                >
                  🧾
                </div>
                <div>
                  <div className="font-extrabold text-[16px] text-white">Receipt ya Bill yahan drag karo</div>
                  <div className="text-slate-400 text-[12.5px] mt-1">
                    USD ($), INR (₹), EUR (€), GBP (£) multi-currency supported
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileRef.current?.click();
                    }}
                  >
                    📁 Browse File
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraRef.current?.click();
                    }}
                  >
                    📸 Take Photo
                  </button>
                </div>
              </div>
            )}

            {/* Scanning Progress Overlay */}
            {busy && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="w-14 h-14 rounded-full border-4 border-t-transparent border-emerald-400 animate-spin mb-4 shadow-lg shadow-emerald-500/20" />
                <div className="font-black text-[16px] text-white">
                  {scanStep === 1 && "⚡ Receipt upload ho rahi hai…"}
                  {scanStep === 2 && "🤖 Gemini AI Vision currency aur bill scan kar raha hai…"}
                  {scanStep >= 3 && "💱 Foreign currency ($) ko Indian Rupee (₹) me convert kiya ja raha hai…"}
                </div>
                <div className="text-[12px] text-emerald-400 mt-2 font-mono">
                  Multi-Currency Detection Active…
                </div>
              </div>
            )}
          </div>

          {/* AI Feature Pill */}
          <div
            className="card !p-3.5 flex items-center justify-between text-[12px] bg-slate-900 border-slate-800"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">💱</span>
              <span className="text-slate-400">
                {isForeign
                  ? `Active Currency: ${currency} (${currencySymbol}) -> Auto-Converting to INR`
                  : "Automatic Multi-Currency & OCR Extraction"}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {result ? `${Math.round((result.confidence || 0.98) * 100)}% Match` : "Ready"}
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: Extracted Form & Details (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {!result && !busy && (
            <div className="card space-y-4 !p-6 border border-slate-800 bg-slate-900 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center text-xl">
                  🌐
                </div>
                <div>
                  <h3 className="font-extrabold text-[15px] text-white">Multi-Currency & Dollar ($) Auto-Conversion</h3>
                  <p className="text-slate-400 text-[12px]">Domestic (₹) aur International ($/€/£) sabhi receipts supported</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="font-bold text-[13px] flex items-center gap-1.5 text-emerald-400">
                    <span>💵</span> Auto Dollar ($) Detection
                  </div>
                  <div className="text-slate-400 text-[11.5px] mt-1 leading-relaxed">
                    Agar receipt America ($), Dubai (AED) ya Europe (€) ki hai, to AI symbol aur currency pehchan leta hai.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="font-bold text-[13px] flex items-center gap-1.5 text-emerald-400">
                    <span>🔄</span> Live INR Conversion
                  </div>
                  <div className="text-slate-400 text-[11.5px] mt-1 leading-relaxed">
                    Current exchange rate (e.g. 1 USD = ₹86.80) se automatic Indian Rupee me convert karke exact amount banata hai.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="font-bold text-[13px] flex items-center gap-1.5 text-emerald-400">
                    <span>✏️</span> Customizable Forex Rate
                  </div>
                  <div className="text-slate-400 text-[11.5px] mt-1 leading-relaxed">
                    Aap apna credit card conversion rate ya markup rate manually customize bhi kar sakte hain.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                  <div className="font-bold text-[13px] flex items-center gap-1.5 text-emerald-400">
                    <span>📒</span> Unified Indian Ledger
                  </div>
                  <div className="text-slate-400 text-[11.5px] mt-1 leading-relaxed">
                    Expense hamesha INR (₹) me save hoti hai taaki aapka monthly budget aur pie charts accurate rahein!
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="card fade-up !p-6 space-y-4 border-2 border-emerald-500/80 bg-slate-900 shadow-2xl">
              {/* Card Title Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-[11px] font-black tracking-wider uppercase text-emerald-400">
                    ✨ AI Extracted & Converted Receipt
                  </div>
                  <h3 className="font-black text-xl text-white mt-0.5">
                    Verify & Confirm Expense
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    {result.method?.includes("ai") ? "🤖 Gemini Vision AI" : "🧾 OCR Scanner"}
                  </span>
                </div>
              </div>

              {/* ── DYNAMIC CURRENCY AUTO-CONVERTER BANNER ──────────────────── */}
              {isForeign && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-emerald-950/40 border border-blue-500/40 shadow-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-blue-400 flex items-center gap-1.5">
                      <span>💱</span> Foreign Currency Auto-Converted
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomRateActive((v) => !v)}
                      className="text-[11px] font-bold text-slate-300 hover:text-white underline"
                    >
                      {customRateActive ? "✓ Done Editing Rate" : "✏️ Adjust Exchange Rate"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-baseline justify-between gap-3 pt-1">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Original Bill:</span>
                      <span className="font-mono text-xl font-bold text-slate-300">
                        {currencySymbol}{originalAmount || "0.00"} {currency}
                      </span>
                    </div>

                    <div className="text-xl text-emerald-400 font-bold">➔</div>

                    <div>
                      <span className="text-[11px] text-slate-400 block">Converted to INR:</span>
                      <span className="font-mono text-2xl font-black text-emerald-400">
                        ₹{parseFloat(form.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block">Applied Rate:</span>
                      <span className="font-mono text-[12px] font-bold text-slate-300">
                        1 {currency} = ₹{exchangeRate}
                      </span>
                    </div>
                  </div>

                  {/* Inline custom rate adjustment */}
                  {customRateActive && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                      <span className="text-[12px] text-slate-400">Custom Exchange Rate (₹ per 1 {currency}):</span>
                      <input
                        type="number"
                        step="0.01"
                        value={exchangeRate}
                        onChange={(e) => {
                          setExchangeRate(e.target.value);
                          updateConvertedInr(originalAmount, e.target.value, currency);
                        }}
                        className="input !w-28 !py-1 text-xs mono font-bold"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Form Grid */}
              <div className="space-y-4">
                {/* Currency Selection Strip */}
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-slate-400">Receipt Currency:</span>
                    <select
                      value={currency}
                      onChange={(e) => handleCurrencyChange(e.target.value)}
                      className="input !w-auto text-[13px] font-bold !py-1.5"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code} ({c.symbol}) — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isForeign && (
                    <span className="text-[11.5px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                      Rate: 1 {currency} = ₹{exchangeRate} INR
                    </span>
                  )}
                </div>

                {/* Shop / Merchant */}
                <div>
                  <label className="label">🏪 Store / Merchant / Shop Name</label>
                  <input
                    className="input font-semibold"
                    placeholder="e.g. Starbucks, Walmart, Apple Store, Domino's"
                    value={form.shop}
                    onChange={setField("shop")}
                  />
                </div>

                {/* Amount Row */}
                <div className="grid sm:grid-cols-2 gap-3.5">
                  {isForeign ? (
                    /* Dual Currency Inputs: Original Foreign + Converted INR */
                    <div>
                      <label className="label">
                        💵 Original Bill Amount ({currencySymbol} {currency})
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 font-bold text-slate-400 text-[15px]">
                          {currencySymbol}
                        </span>
                        <input
                          className="input mono font-extrabold text-[17px] pl-8 text-white"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={originalAmount}
                          onChange={(e) => {
                            setOriginalAmount(e.target.value);
                            updateConvertedInr(e.target.value, exchangeRate, currency);
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    /* Standard INR Amount Input */
                    <div>
                      <label className="label">💰 Total Amount (₹ INR)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 font-bold text-slate-400 text-[15px]">
                          ₹
                        </span>
                        <input
                          className="input mono font-extrabold text-[17px] pl-8 text-white"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={form.amount}
                          onChange={setField("amount")}
                        />
                      </div>
                    </div>
                  )}

                  {/* Converted INR Field (when foreign currency) or Date */}
                  {isForeign ? (
                    <div>
                      <label className="label text-emerald-400">
                        🇮🇳 Converted Indian Rupee Amount (INR ₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 font-bold text-emerald-400 text-[15px]">
                          ₹
                        </span>
                        <input
                          className="input mono font-extrabold text-[17px] pl-8 text-emerald-400 border-emerald-500/50 bg-emerald-950/20"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={form.amount}
                          onChange={setField("amount")}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="label">📅 Date</label>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-emerald-400 underline mb-1"
                          onClick={() => setForm((p) => ({ ...p, date: today() }))}
                        >
                          Set Today
                        </button>
                      </div>
                      <input
                        className="input"
                        type="date"
                        value={form.date}
                        onChange={setField("date")}
                      />
                    </div>
                  )}
                </div>

                {/* If foreign currency, show Date and Tax in separate row */}
                {isForeign && (
                  <div className="grid sm:grid-cols-2 gap-3.5">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="label">📅 Date</label>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-emerald-400 underline mb-1"
                          onClick={() => setForm((p) => ({ ...p, date: today() }))}
                        >
                          Set Today
                        </button>
                      </div>
                      <input
                        className="input"
                        type="date"
                        value={form.date}
                        onChange={setField("date")}
                      />
                    </div>

                    <div>
                      <label className="label">🧾 Tax / GST / VAT (INR ₹)</label>
                      <input
                        className="input mono"
                        type="number"
                        step="0.01"
                        value={form.tax}
                        onChange={setField("tax")}
                      />
                    </div>
                  </div>
                )}

                {/* Category & Payment Mode */}
                <div className="grid sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="label">🏷️ Expense Category (AI Selected)</label>
                    <select
                      className="input font-medium"
                      value={form.category}
                      onChange={setField("category")}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">💳 Payment Mode</label>
                    <select
                      className="input font-medium"
                      value={form.payment_mode}
                      onChange={setField("payment_mode")}
                    >
                      {PAYMENT_MODES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description Note */}
                <div>
                  <label className="label">📝 Description / Note</label>
                  <input
                    className="input"
                    placeholder="Receipt description"
                    value={form.description}
                    onChange={setField("description")}
                  />
                </div>

                {/* Line Items Breakdown (Dual Currency: Original & Converted INR) */}
                {Array.isArray(result.items) && result.items.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 text-[12px] space-y-2">
                    <div className="font-bold text-slate-400 uppercase text-[11px] tracking-wider flex justify-between">
                      <span>📋 Extracted Line Items:</span>
                      {isForeign && <span>Original Price ➔ Converted (INR)</span>}
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto divide-y divide-slate-800/60">
                      {result.items.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between pt-1">
                          <span className="text-slate-300">
                            {it.qty ? `${it.qty}x ` : ""}
                            <b>{it.name || "Item"}</b>
                          </span>
                          <span className="font-mono text-slate-200">
                            {isForeign && it.original_price != null ? (
                              <>
                                <span className="text-slate-400 mr-1.5">
                                  {currencySymbol}{Number(it.original_price).toFixed(2)}
                                </span>
                                <span className="text-emerald-400 font-bold">
                                  ₹{Number(it.price).toFixed(2)}
                                </span>
                              </>
                            ) : (
                              <span>₹{Number(it.price || 0).toFixed(2)}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    className="btn btn-primary flex-1 text-[14.5px] py-3.5 shadow-xl font-bold flex items-center justify-center gap-2"
                    onClick={confirmAdd}
                    disabled={busy || !form.amount || parseFloat(form.amount) <= 0}
                  >
                    <span>💾 Save to Expenses</span>
                    <span>({inr(parseFloat(form.amount) || 0)})</span>
                  </button>

                  <button
                    type="button"
                    className="btn shrink-0"
                    onClick={() => {
                      setResult(null);
                      setImg(null);
                    }}
                    disabled={busy}
                  >
                    ✕ Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RECENT SCANS GALLERY ─────────────────────────────────────────── */}
      <div className="card !p-5 space-y-3 bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="card-title !mb-0 text-white font-extrabold text-[15px]">
              🗂️ Recent Scanned Receipts & Invoices
            </h3>
            <p className="text-slate-400 text-[12px] mt-0.5">
              Saved receipts with multi-currency audit trail & auto-booking status
            </p>
          </div>
          <span className="text-[12px] text-slate-400 font-mono">{recent.length} recent</span>
        </div>

        {recent.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-[13px]">
            Abhi tak koi receipt scan nahi hui hai. Upar se pehli receipt upload karein! 📷
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
            {recent.map((r) => (
              <div
                key={r.id}
                className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-850 group transition hover:border-emerald-500 shadow-md"
              >
                {/* Delete button */}
                <button
                  type="button"
                  className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full text-[11px] font-bold leading-none grid place-items-center opacity-80 group-hover:opacity-100 transition shadow"
                  style={{ background: "rgba(220, 38, 38, 0.9)", color: "#fff" }}
                  title="Delete scan"
                  onClick={(e) => deleteRecent(r.id, e)}
                >
                  ✕
                </button>

                <div
                  className="cursor-pointer"
                  onClick={() => r.has_image && setPreviewModal(imgSrc(r.id))}
                >
                  {r.has_image ? (
                    <img
                      src={imgSrc(r.id)}
                      alt={r.shop}
                      className="h-28 w-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="h-28 grid place-items-center text-3xl bg-slate-900">
                      🧾
                    </div>
                  )}

                  <div className="p-2.5">
                    <div className="text-[12px] font-bold truncate text-white" title={r.shop}>
                      {r.shop || "Receipt"}
                    </div>
                    {/* INR Amount */}
                    <div className="text-[13px] font-mono font-extrabold text-emerald-400 mt-0.5">
                      {inr(r.amount)}
                    </div>
                    {/* Foreign Currency Badge if applicable */}
                    {r.is_foreign_currency && r.original_amount && (
                      <div className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 mt-1 truncate">
                        Orig: {r.currency_symbol || "$"}{r.original_amount} {r.original_currency}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10.5px] mt-1.5">
                      <span className="text-slate-400">{r.date || "—"}</span>
                      <span
                        className="font-bold"
                        style={{ color: r.expense_id ? "var(--accent)" : "var(--warning)" }}
                      >
                        {r.expense_id ? "✅ Added" : "⏳ Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── LIGHTBOX IMAGE MODAL ─────────────────────────────────────────── */}
      {previewModal && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer fade-up"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 text-white font-bold grid place-items-center hover:bg-black"
              onClick={() => setPreviewModal(null)}
            >
              ✕
            </button>
            <img
              src={previewModal}
              alt="Receipt Preview"
              className="max-h-[85vh] w-auto object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
