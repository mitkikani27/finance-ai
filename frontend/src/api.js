// API client — every call carries the JWT; on genuine 401 we bounce to login.
// Network failures (server waking up) NEVER wipe the session — we surface a
// friendly retryable error instead.
const TOKEN_KEY = "finmate_token";
let memoryToken = null; // survives even when localStorage is blocked (sandboxed iframes)

export const getStoredToken = () => {
  try { const t = localStorage.getItem(TOKEN_KEY); if (t) return t; } catch {}
  return memoryToken;
};

const setCookie = (t) => {
  // Cookie fallback: some preview proxies strip the Authorization header —
  // the cookie survives and get_current_user accepts either.
  document.cookie = t
    ? `finmate_token=${t}; path=/; max-age=2592000; SameSite=Lax`
    : "finmate_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; SameSite=Lax";
};
export const storeToken = (t) => {
  memoryToken = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
  try { setCookie(t); } catch {}
};

export async function api(path, { method = "GET", body, raw = false } = {}) {
  const headers = {};
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    // server unreachable (sleeping sandbox / slow cold start) — keep the token!
    const err = new Error("Server connect nahi ho raha — 5 second ruk kar dobara try karein.");
    err.network = true;
    throw err;
  }

  // Last-resort auth channel: if header + cookie both got stripped in transit,
  // retry once with the token as a query param (proxies never rewrite URLs).
  const canRetry = !!token && (!path.startsWith("/api/auth/") || path === "/api/auth/me");
  if (res.status === 401 && canRetry) {
    const sep = path.includes("?") ? "&" : "?";
    try {
      res = await fetch(`${path}${sep}_auth=${encodeURIComponent(token)}`,
        { method, headers, body: payload, credentials: "same-origin" });
    } catch {}
  }

  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    // genuine expired/invalid session → sign out
    storeToken(null);
    window.location.href = "/login?expired=1";
    throw new Error("Session expired — please sign in again.");
  }
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data && data.detail ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : res.statusText;
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return data;
}
