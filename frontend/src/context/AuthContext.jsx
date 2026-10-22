import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getStoredToken, storeToken } from "../api.js";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getStoredToken()) {
        // Retry on network errors (sandbox/server waking up) — never log the
        // user out for a cold start. Only a real 401 clears the session.
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const me = await api("/api/auth/me");
            if (!cancelled) setUser(me);
            break;
          } catch (err) {
            if (err.status === 401 || err.status === 403) { storeToken(null); break; }
            if (attempt < 4) await new Promise(r => setTimeout(r, 1500));
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api("/api/auth/login", { method: "POST", body: { email, password } });
    storeToken(r.token); setUser(r.user); return r.user;
  }, []);
  const register = useCallback(async (data) => {
    const r = await api("/api/auth/register", { method: "POST", body: data });
    storeToken(r.token); setUser(r.user); return r.user;
  }, []);
  const google = useCallback(async () => {
    const r = await api("/api/auth/login/google", { method: "POST", body: {} });
    storeToken(r.token); setUser(r.user); return r.user;
  }, []);
  const exchangeClerk = useCallback(async (clerkToken, clerkEmail, clerkName) => {
    const r = await api("/api/auth/clerk", { method: "POST", body: { token: clerkToken, email: clerkEmail, name: clerkName } });
    storeToken(r.token); setUser(r.user); return r.user;
  }, []);
  const otpLogin = useCallback(async (phone, otp) => {
    const r = await api("/api/auth/login/otp/verify", { method: "POST", body: { phone, otp } });
    storeToken(r.token); setUser(r.user); return r.user;
  }, []);
  const logout = useCallback(() => { storeToken(null); setUser(null); }, []);
  const refresh = useCallback(async () => { setUser(await api("/api/auth/me")); }, []);

  return <Ctx.Provider value={{ user, setUser, loading, login, register, google, exchangeClerk, otpLogin, logout, refresh }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
