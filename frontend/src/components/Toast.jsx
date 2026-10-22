import React, { createContext, useContext, useState, useCallback } from "react";

const Ctx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, type = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div key={t.id} className="fade-up glass border px-4 py-3 rounded-xl text-[13px] font-medium shadow-lg"
            style={{
              borderColor: t.type === "error" ? "var(--danger)" : t.type === "success" ? "var(--accent)" : "var(--accent-2)",
              background: "var(--card)",
            }}>
            {t.type === "success" ? "✅ " : t.type === "error" ? "⚠️ " : "💡 "}{t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
