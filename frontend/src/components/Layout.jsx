import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";

const NAV = [
  { to: "/", key: "dashboard", icon: "📊", end: true },
  { to: "/expenses", key: "expenses", icon: "💸" },
  { to: "/income", key: "income", icon: "💰" },
  { to: "/budget", key: "budget", icon: "🎯" },
  { to: "/investments", key: "investments", icon: "📈" },
  { to: "/market", key: "market", icon: "🔥" },
  { to: "/reports", key: "reports", icon: "📄" },
  { to: "/chat", key: "chat", icon: "🤖" },
  { to: "/ocr", key: "ocr", icon: "🧾" },
  { to: "/settings", key: "settings", icon: "⚙️" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useLang();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("finmate_theme") || "dark");
  const [notif, setNotif] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("finmate_theme", theme);
  }, [theme]);

  useEffect(() => {
    api("/api/goals/notifications").then((r) => setNotif(r)).catch(() => {});
  }, []);

  const doLogout = async () => {
    await logout();
    nav("/login", { replace: true });
  };

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl grid place-items-center text-lg"
             style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>💰</div>
        <div>
          <div className="font-extrabold text-[15px] leading-tight">FinMate <span style={{color:"var(--accent)"}}>AI</span></div>
          <div className="text-[10.5px] muted">AI Finance Manager</div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition ${
                isActive ? "text-white" : "muted hover:text-[var(--text)]"}`}>
            {({ isActive }) => (
              <span className="w-full" style={isActive ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)", borderRadius: 10 } : {}}>
                <span className="flex items-center gap-3 px-0">{n.icon}&nbsp;{t(n.key)}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5 px-2 pb-3">
          <div className="w-9 h-9 rounded-full grid place-items-center font-bold text-[13px]"
               style={{ background: "var(--card-2)", color: "var(--accent)" }}>
            {(user?.full_name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[13px] truncate">{user?.full_name}</div>
            <div className="text-[11px] muted truncate">{user?.email}</div>
          </div>
        </div>
        <button className="btn w-full btn-sm" onClick={doLogout}>↩ {t("logout")}</button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden lg:block w-60 shrink-0 border-r" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64" style={{ background: "var(--bg-soft)" }}>{sidebar}</aside>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center gap-3 px-4 shrink-0"
                style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <button className="btn btn-sm lg:hidden" onClick={() => setOpen(true)}>☰</button>
          <div className="flex-1" />
          <div className="relative">
            <button className="btn btn-sm" onClick={() => api("/api/goals/notifications").then(setNotif).catch(() => {})}>
              🔔{notif.length > 0 && <span className="badge" style={{ background: "var(--danger)", color: "#fff" }}>{notif.length}</span>}
            </button>
            {notif.length > 0 && (
              <div className="absolute right-0 top-11 w-80 card fade-up z-50 !p-2">
                {notif.slice(0, 5).map((n) => (
                  <div key={n.id} className="px-3 py-2.5 rounded-lg hover:bg-[var(--card-2)] flex justify-between items-start">
                    <div>
                      <div className="text-[13px] font-semibold">🔔 {n.title}</div>
                      <div className="text-[12px] muted mt-0.5">{n.body}</div>
                    </div>
                    <button className="muted hover:text-[var(--danger)] text-lg px-2 leading-none" title="Clear" onClick={(e) => {
                       e.stopPropagation();
                       api(`/api/goals/notifications/${n.id}`, { method: "DELETE" }).then(() => {
                           setNotif(prev => prev.filter(x => x.id !== n.id));
                       }).catch(() => {});
                    }}>&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <select className="input !w-auto !py-1.5 !px-2.5 !text-[12.5px]" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">English</option><option value="hi">हिंदी</option><option value="gu">ગુજરાતી</option>
          </select>
          <button className="btn btn-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
