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

  const [form, setForm] = useState({
    shop: "",
    amount: "",
    tax: "0",
    date: today(),
    category: "Shopping",
    payment_mode: "Card",
    description: "",
  });

  const setField = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const loadRecent = useCallback(() => {
    api("/api/ocr/recent").then(setRecent).catch(() => {});
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

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
        setResult(r);
        const detectedCat = r.category || r.ai_category || "Shopping";
        setForm({
          shop: r.shop || "Receipt",
          amount: r.amount ? String(r.amount) : "",
          tax: r.tax ? String(r.tax) : "0",
          date: r.date || today(),
          category: CATEGORIES.includes(detectedCat) ? detectedCat : "Shopping",
          payment_mode: r.payment_mode || "Card",
          description: `Receipt: ${r.shop || "Store"}`,
        });
        push("✨ AI ne receipt scan karke details auto-fetch kar li!", "success");
      })
      .catch((e) => {
        push(e.message || "Receipt scan fail ho gaya. Kripya dobara try karein.", "error");
      })
      .finally(() => {
        clearInterval(stepTimer);
        setBusy(false);
      });
  }

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
      setResult(r);
      if (r.id) {
        setImg(imgSrc(r.id));
      }
      const detectedCat = r.category || r.ai_category || "Food";
      setForm({
        shop: r.shop || "Fast Food",
        amount: r.amount ? String(r.amount) : "52.50",
        tax: r.tax ? String(r.tax) : "2.50",
        date: r.date || today(),
        category: CATEGORIES.includes(detectedCat) ? detectedCat : "Food",
        payment_mode: r.payment_mode || "Card",
        description: `Receipt: ${r.shop || "Fast Food"}`,
      });
      push("✨ Sample bill auto-scanned by Gemini AI Vision!", "success");
      loadRecent();
    } catch (e) {
      push(e.message || "Sample scan failed", "error");
    } finally {
      clearInterval(stepTimer);
      setBusy(false);
    }
  }

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
          amount: numAmt,
          tax: parseFloat(form.tax) || 0,
          date: form.date,
          category: form.category || "Shopping",
          payment_mode: form.payment_mode || "Card",
          description: form.description || `Receipt: ${form.shop}`,
        },
      });

      setSaved({ ...r, receipt_id: result.id, shop: form.shop });
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
    <div className="space-y-6 max-w-[1140px] mx-auto pb-10">
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11.5px] font-bold mb-2"
               style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
            <span>⚡ Powered by Gemini AI Vision</span>
            <span>·</span>
            <span>Auto-Fetch Engine</span>
          </div>
          <h1 className="text-[24px] font-extrabold tracking-tight flex items-center gap-2">
            <span>🧾</span> {t("ocr")} & Auto-Expense
          </h1>
          <p className="muted text-[13px] mt-0.5">
            Bill ya receipt ki photo upload karo — AI automatically Shop Name, Date, Amount, Tax aur Category extract kar lega!
          </p>
        </div>

        {/* Quick action shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-sm"
            onClick={onSample}
            disabled={busy}
            style={{
              background: "color-mix(in srgb, var(--accent) 15%, transparent)",
              borderColor: "var(--accent)",
              color: "var(--accent)",
            }}
            title="Fast Food sample receipt scan karke test karein"
          >
            ⚡ Try Sample Bill
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
          className="card fade-up border-2"
          style={{
            borderColor: "var(--accent)",
            background: "color-mix(in srgb, var(--accent) 8%, var(--card))",
          }}
        >
          <div className="flex flex-wrap items-center gap-4">
            {saved.receipt_id && (
              <img
                src={imgSrc(saved.receipt_id)}
                alt="Receipt"
                className="h-20 w-20 object-cover rounded-xl border cursor-pointer hover:opacity-90 transition"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setPreviewModal(imgSrc(saved.receipt_id))}
                title="Bada dekhne ke liye click karo"
              />
            )}
            <div className="flex-1 min-w-[240px]">
              <div className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                🎉 Successfully Booked to Expenses
              </div>
              <div className="font-extrabold text-[19px] mt-0.5">
                {inr(saved.amount)} · {saved.shop || "Receipt"}
              </div>
              <div className="muted text-[12px] mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span>Category: <b>{saved.category}</b></span>
                <span>·</span>
                <span>Date: <b>{saved.date}</b></span>
                <span>·</span>
                <span>Status: <b style={{ color: "var(--accent)" }}>Saved ✅</b></span>
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

      {/* ── MAIN WORKSPACE (Upload & Extracted Form) ──────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-5">

        {/* LEFT COLUMN: Upload Zone / Receipt Image Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div
            className={`card border-2 border-dashed relative overflow-hidden flex flex-col items-center justify-center min-h-[340px] text-center p-6 transition-all ${
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
                  className="max-h-[380px] w-full object-contain rounded-xl mx-auto"
                />
                {!busy && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-xl flex items-center justify-center gap-2">
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
                  className="w-16 h-16 rounded-2xl grid place-items-center text-3xl mx-auto shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    color: "#fff",
                  }}
                >
                  🧾
                </div>
                <div>
                  <div className="font-bold text-[16px]">Receipt ya Bill yahan drag karo</div>
                  <div className="muted text-[12.5px] mt-1">
                    JPG, PNG, WebP supported · Up to 10 MB
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
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                      borderColor: "var(--accent)",
                      color: "var(--accent)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSample();
                    }}
                  >
                    ⚡ Try Sample Bill
                  </button>
                </div>
              </div>
            )}

            {/* Scanning Progress Overlay */}
            {busy && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="w-14 h-14 rounded-full border-4 border-t-transparent border-[var(--accent)] animate-spin mb-4" />
                <div className="font-extrabold text-[16px] text-white">
                  {scanStep === 1 && "⚡ Image upload ho rahi hai…"}
                  {scanStep === 2 && "🤖 Gemini AI Vision receipt padh raha hai…"}
                  {scanStep >= 3 && "🎯 Amount, Tax, Shop aur Category auto-fetch ho rahi hai…"}
                </div>
                <div className="text-[12px] text-white/70 mt-1">
                  Kuch hi seconds me details taiyar ho jayengi…
                </div>
              </div>
            )}
          </div>

          {/* AI Feature Pill */}
          <div
            className="card !p-3.5 flex items-center justify-between text-[12px]"
            style={{ background: "var(--bg-soft)" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <span className="muted">
                {result?.method === "ai_vision"
                  ? "Gemini Multimodal AI Vision active"
                  : "Automatic Optical Character Extraction"}
              </span>
            </div>
            <span
              className="badge"
              style={{
                background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                color: "var(--accent)",
              }}
            >
              {result ? `${Math.round((result.confidence || 0.95) * 100)}% Confidence` : "Ready"}
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: Extracted Form & Details (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {!result && !busy && (
            <div className="card space-y-4 !p-6 border" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl grid place-items-center text-xl"
                  style={{ background: "var(--bg-soft)" }}
                >
                  💡
                </div>
                <div>
                  <h3 className="font-bold text-[15px]">Smart Receipt Scanning Kaise Kaam Karta Hai?</h3>
                  <p className="muted text-[12px]">Tesseract OCR + Google Gemini AI Vision Dual-Engine</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="font-bold text-[13px] flex items-center gap-1.5 text-[var(--accent)]">
                    <span>1️⃣</span> Auto-Detect Details
                  </div>
                  <div className="muted text-[11.5px] mt-1 leading-relaxed">
                    Dukan ka naam, bill ki taarikh, total amount aur GST/tax bina kisi manual entry ke extract ho jata hai.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="font-bold text-[13px] flex items-center gap-1.5 text-[var(--accent)]">
                    <span>2️⃣</span> AI Smart Category
                  </div>
                  <div className="muted text-[11.5px] mt-1 leading-relaxed">
                    Food, Groceries, Petrol, Medical, Shopping — AI automatically sahi category assign karta hai.
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="font-bold text-[13px] flex items-center gap-1.5 text-[var(--accent)]">
                    <span>3️⃣</span> One-Click Expense Entry
                  </div>
                  <div className="muted text-[11.5px] mt-1 leading-relaxed">
                    Fields verify karo aur ek click me expense database me add karo. Monthly budget turant update hoga!
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="font-bold text-[13px] flex items-center gap-1.5 text-[var(--accent)]">
                    <span>4️⃣</span> Bill Image Storage
                  </div>
                  <div className="muted text-[11.5px] mt-1 leading-relaxed">
                    Aapki receipt safe store rehti hai — future tax filing ya warranty claim ke liye kabhi bhi download karo.
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="card fade-up !p-6 space-y-4 border-2" style={{ borderColor: "var(--accent)" }}>
              {/* Card Title Bar */}
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <div>
                  <div className="text-[11px] font-bold tracking-wider uppercase" style={{ color: "var(--accent)" }}>
                    ✨ AI Extracted Receipt
                  </div>
                  <h3 className="font-extrabold text-[17px] mt-0.5">
                    Verify & Confirm Expense
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="badge"
                    style={{
                      background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    {result.method === "ai_vision" ? "🤖 Gemini AI Vision" : "🧾 OCR Extracted"}
                  </span>
                </div>
              </div>

              {/* Form Grid */}
              <div className="space-y-3.5">
                {/* Shop / Merchant */}
                <div>
                  <label className="label">🏪 Store / Merchant / Shop Name</label>
                  <input
                    className="input font-semibold"
                    placeholder="e.g. Domino's, D-Mart, HP Petrol Pump"
                    value={form.shop}
                    onChange={setField("shop")}
                  />
                </div>

                {/* Amount & Date in 2 columns */}
                <div className="grid sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="label">💰 Total Amount ({result.currency || "₹"})</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 font-bold muted text-[15px]">
                        {result.currency === "USD" ? "$" : "₹"}
                      </span>
                      <input
                        className="input mono font-extrabold text-[17px] pl-8"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={form.amount}
                        onChange={setField("amount")}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="label">📅 Date</label>
                      <button
                        type="button"
                        className="text-[11px] muted hover:text-[var(--accent)] underline mb-1"
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
                </div>

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

                {/* Tax / GST Info + Description */}
                <div className="grid sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="label">🧾 Tax / GST / VAT</label>
                    <input
                      className="input mono"
                      type="number"
                      step="0.01"
                      value={form.tax}
                      onChange={setField("tax")}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="label">📝 Description / Note</label>
                    <input
                      className="input"
                      placeholder="Receipt description"
                      value={form.description}
                      onChange={setField("description")}
                    />
                  </div>
                </div>

                {/* Line Items Breakdown (if AI detected itemized list) */}
                {Array.isArray(result.items) && result.items.length > 0 && (
                  <div
                    className="p-3 rounded-xl border text-[12px] space-y-1.5"
                    style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}
                  >
                    <div className="font-bold muted uppercase text-[10.5px] tracking-wider">
                      📋 Detected Items Breakdown:
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {result.items.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between py-0.5">
                          <span>
                            {it.qty ? `${it.qty}x ` : ""}
                            <b>{it.name || (typeof it === "string" ? it : "Item")}</b>
                          </span>
                          <span className="mono font-semibold">
                            {it.price ? `${result.currency === "USD" ? "$" : "₹"}${it.price}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    className="btn btn-primary flex-1 text-[14.5px] py-3 shadow-lg"
                    onClick={confirmAdd}
                    disabled={busy || !form.amount || parseFloat(form.amount) <= 0}
                  >
                    💾 Save as Expense ({inr(parseFloat(form.amount) || 0)})
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
      <div className="card !p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="card-title !mb-0">🗂️ Recent Scanned Receipts</h3>
            <p className="muted text-[12px] mt-0.5">Saved receipt images with auto-booked status</p>
          </div>
          <span className="text-[12px] muted">{recent.length} recent</span>
        </div>

        {recent.length === 0 ? (
          <div className="text-center py-8 muted text-[13px]">
            Abhi tak koi receipt scan nahi hui hai. Upar se pehli receipt upload karein! 📷
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
            {recent.map((r) => (
              <div
                key={r.id}
                className="relative rounded-xl overflow-hidden border group transition hover:border-[var(--accent)]"
                style={{ borderColor: "var(--border)", background: "var(--card-2)" }}
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
                    <div className="h-28 grid place-items-center text-3xl" style={{ background: "var(--bg-soft)" }}>
                      🧾
                    </div>
                  )}

                  <div className="p-2.5">
                    <div className="text-[12px] font-bold truncate" title={r.shop}>
                      {r.shop || "Receipt"}
                    </div>
                    <div className="text-[12px] mono font-extrabold mt-0.5">
                      {inr(r.amount)}
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] mt-1">
                      <span className="muted">{r.date || "—"}</span>
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
            className="relative max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl"
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
