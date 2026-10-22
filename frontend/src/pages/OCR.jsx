import React, { useRef, useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, getStoredToken } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useLang } from "../i18n.jsx";
import { inr, today } from "../format.js";

const imgSrc = (id) => `/api/ocr/image/${id}?_auth=${encodeURIComponent(getStoredToken() || "")}`;

export default function OCR() {
  const { push } = useToast();
  const { t } = useLang();
  const fileRef = useRef(null);
  const [img, setImg] = useState(null);           // preview object URL
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);        // success info after confirm
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ shop: "", amount: "", date: today(), category: "", description: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const loadRecent = useCallback(() => {
    api("/api/ocr/recent").then(setRecent).catch(() => {});
  }, []);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  function onFile(f) {
    if (!f) return;
    setSaved(null);
    setImg(URL.createObjectURL(f));
    setResult(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    api("/api/ocr/upload", { method: "POST", body: fd })
      .then((r) => {
        setResult(r);
        setForm({ shop: r.shop || "", amount: r.amount || "", date: r.date || today(), category: r.ai_category || "", description: `Receipt: ${r.shop || "shop"}` });
        push("Receipt scan ho gayi — fields check karke save karo", "success");
      })
      .catch((e) => push(e.message, "error"))
      .finally(() => setBusy(false));
  }

  async function confirmAdd() {
    setBusy(true);
    try {
      const r = await api(`/api/ocr/confirm/${result.id}`, {
        method: "POST",
        body: { ...form, amount: parseFloat(form.amount), category: form.category || "Shopping" },
      });
      setSaved({ ...r, receipt_id: result.id });
      setResult(null);
      push(`✅ ${inr(r.amount)} ki expense add ho gayi (${r.date})`, "success");
      loadRecent();
    } catch (e) { push(e.message, "error"); }
    finally { setBusy(false); }
  }

  async function deleteRecent(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Is scan ko delete karein?")) return;
    try {
      await api(`/api/ocr/${id}`, { method: "DELETE" });
      setRecent((list) => list.filter((r) => r.id !== id));
      push("Scan delete ho gayi", "success");
    } catch (err) { push(err.message, "error"); }
  }

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <div>
        <h1 className="text-[22px] font-extrabold">🧾 {t("ocr")}</h1>
        <p className="muted text-[13px]">Tesseract OCR (English + Hindi) extracts shop, date, amount & GST — then AI Module 4 categorizes it</p>
      </div>

      {/* ✅ SUCCESS PANEL — save ke baad bhi receipt dikhti hai */}
      {saved && (
        <div className="card fade-up" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 7%, transparent)" }}>
          <div className="flex flex-wrap items-center gap-4">
            {saved.receipt_id && (
              <img src={imgSrc(saved.receipt_id)} alt="receipt" className="h-24 rounded-lg border"
                   style={{ borderColor: "var(--border)" }} />
            )}
            <div className="flex-1 min-w-[220px]">
              <div className="font-extrabold text-[15px]" style={{ color: "var(--accent)" }}>
                ✅ Expense add ho gayi — {inr(saved.amount)}
              </div>
              <div className="muted text-[12.5px] mt-1">
                Category: <b>{saved.category}</b> · Date: <b>{saved.date}</b>
              </div>
              <div className="muted text-[11.5px] mt-1">
                ⚠️ Expenses page months ka filter lagata hai — receipt ki date ({saved.date}) dekhne ke liye
                neeche wala button sahi month me le jata hai.
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Link className="btn btn-primary" to={`/expenses?month=${saved.month}`}>📒 Expenses me dekho →</Link>
              <button className="btn" onClick={() => { setSaved(null); setImg(null); fileRef.current?.click(); }}>
                📷 Nayi receipt scan karo
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <div className="card border-2 border-dashed grid place-items-center min-h-72 cursor-pointer text-center"
               style={{ borderColor: "var(--border)" }}
               onClick={() => fileRef.current?.click()}
               onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
            {img ? (
              <img src={img} alt="receipt" className="max-h-96 rounded-lg" />
            ) : (
              <div className="p-8">
                <div className="text-4xl mb-2">📷</div>
                <div className="font-bold text-[14.5px]">{busy ? "Scanning receipt…" : "Drop a receipt photo here"}</div>
                <div className="muted text-[12.5px] mt-1">JPG / PNG · up to 10 MB · or click to browse</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files[0])} />

          {/* 🖼️ RECENT SCANS — saved receipt images with status */}
          {recent.length > 0 && (
            <div className="card !p-4 mt-4">
              <h3 className="card-title">🗂️ Recent scans</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 mt-2">
                {recent.map((r) => (
                  <div key={r.id} className="relative rounded-lg overflow-hidden border group" style={{ borderColor: "var(--border)" }}>
                    <button
                      type="button"
                      className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full text-[11px] font-bold leading-none grid place-items-center"
                      style={{ background: "color-mix(in srgb, var(--danger) 90%, black)", color: "#fff" }}
                      title="Delete scan"
                      onClick={(e) => deleteRecent(r.id, e)}
                    >✕</button>
                    <a href={r.has_image ? imgSrc(r.id) : undefined} target="_blank" rel="noreferrer"
                       title={`${r.shop || "Receipt"} · ${inr(r.amount)} · ${r.expense_id ? "added ✅" : "not added"}`}>
                      {r.has_image ? (
                        <img src={imgSrc(r.id)} alt={r.shop} className="h-20 w-full object-cover group-hover:opacity-80 transition" />
                      ) : (
                        <div className="h-20 grid place-items-center text-xl" style={{ background: "var(--bg-soft)" }}>🧾</div>
                      )}
                      <div className="px-1.5 py-1">
                        <div className="text-[10.5px] font-bold truncate">{r.shop || "Receipt"}</div>
                        <div className="text-[10px]" style={{ color: r.expense_id ? "var(--accent)" : "var(--warning)" }}>
                          {r.expense_id ? "✅ added" : "⏳ pending"}
                        </div>
                      </div>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!result && !saved && !img && (
            <div className="card muted text-[13px] leading-relaxed">
              <b className="text-[var(--text)]">How it works</b><br />
              1️⃣ Upload a receipt photo (bill, invoice, store slip).<br />
              2️⃣ Tesseract OCR reads the text and regex engines pull out <b className="text-[var(--text)]">shop, date, total & GST</b>.<br />
              3️⃣ The AI categorizer predicts the category from the shop name.<br />
              4️⃣ You verify the fields and the expense is booked automatically — receipt image bhi save hoti hai.
            </div>
          )}
          {busy && !result && !img && <div className="card pulse text-center muted">🤖 Reading the receipt…</div>}
          {result && (
            <div className="card fade-up">
              <h3 className="card-title">✅ Extracted — verify & save</h3>
              <div className="space-y-3">
                <div><label className="label">Shop</label>
                  <input className="input" value={form.shop} onChange={set("shop")} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Amount (₹)</label>
                    <input className="input mono" type="number" step="0.01" value={form.amount} onChange={set("amount")} /></div>
                  <div><label className="label">Date — dhyan se! 📅</label>
                    <input className="input" type="date" value={form.date} onChange={set("date")} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Category (AI suggestion)</label>
                    <select className="input" value={form.category} onChange={set("category")}>
                      <option value="">—</option>
                      {["Food","Groceries","Fuel","Rent","EMI","Medical","Transport","Entertainment","Shopping","Utilities","Education","Travel","Other"].map((c) => <option key={c}>{c}</option>)}
                    </select></div>
                  <div><label className="label">GST / tax (info)</label>
                    <input className="input mono" value={result.tax ? inr(result.tax, { decimals: 2 }) : "—"} disabled /></div>
                </div>
                <div><label className="label">Description</label>
                  <input className="input" value={form.description} onChange={set("description")} /></div>
                <div className="muted text-[11.5px] rounded-lg px-3 py-2" style={{ background: "var(--bg-soft)" }}>
                  OCR confidence {Math.round((result.confidence || 0) * 100)}% · raw preview: “{result.raw_text_preview?.slice(0, 90)}…”
                </div>
                <button className="btn btn-primary w-full" onClick={confirmAdd} disabled={busy || !form.amount}>
                  💾 Save as expense ({inr(parseFloat(form.amount) || 0)})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
