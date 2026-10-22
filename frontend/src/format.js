// Indian rupee formatting (lakh/crore grouping via en-IN locale)
export function inr(x, { decimals = 0 } = {}) {
  if (x === null || x === undefined || isNaN(x)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(x);
}

export function compact(x) {
  if (x >= 1e7) return `₹${(x / 1e7).toFixed(2)} Cr`;
  if (x >= 1e5) return `₹${(x / 1e5).toFixed(2)} L`;
  return inr(x);
}

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function monthLabel(m) { // "2026-09" -> "Sep 2026"
  const [y, mo] = m.split("-");
  return `${MONTHS[+mo - 1]} ${y}`;
}
export function shortMonth(m) { // "2026-09" -> "Sep 26"
  const [y, mo] = m.split("-");
  return `${MONTHS[+mo - 1]} ${y.slice(2)}`;
}
export function today() {
  return new Date().toISOString().slice(0, 10);
}
export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export const CATEGORY_META = {
  Food:          { icon: "🍛", color: "#f97316" },
  Groceries:     { icon: "🛒", color: "#22c55e" },
  Fuel:          { icon: "⛽", color: "#eab308" },
  Rent:          { icon: "🏠", color: "#8b5cf6" },
  EMI:           { icon: "🏦", color: "#ef4444" },
  Medical:       { icon: "💊", color: "#ec4899" },
  Transport:     { icon: "🚕", color: "#06b6d4" },
  Entertainment: { icon: "🎬", color: "#a855f7" },
  Shopping:      { icon: "🛍️", color: "#f43f5e" },
  Utilities:     { icon: "💡", color: "#84cc16" },
  Education:     { icon: "📚", color: "#3b82f6" },
  Travel:        { icon: "✈️", color: "#14b8a6" },
  Investment:    { icon: "📈", color: "#10b981" },
  Insurance:     { icon: "🛡️", color: "#64748b" },
  Other:         { icon: "💳", color: "#64748b" },
};
export const catIcon = (c) => CATEGORY_META[c]?.icon ?? "💳";
export const catColor = (c) => CATEGORY_META[c]?.color ?? "#64748b";
