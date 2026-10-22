import React from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Expenses from "./pages/Expenses.jsx";
import Income from "./pages/Income.jsx";
import Budget from "./pages/Budget.jsx";
import Fraud from "./pages/Fraud.jsx";
import Investments from "./pages/Investments.jsx";
import Market from "./pages/Market.jsx";
import Reports from "./pages/Reports.jsx";
import Chat from "./pages/Chat.jsx";
import OCR from "./pages/OCR.jsx";
import Settings from "./pages/Settings.jsx";

import { ClerkAuthWrapper, ClerkSSOCallback } from "./clerk.jsx";

function SSOCallbackHandler() {
  const { exchangeClerk } = useAuth();
  const nav = useNavigate();
  return (
    <div className="h-full grid place-items-center">
      <div className="pulse text-3xl">💰</div>
      <ClerkAuthWrapper onAuthenticated={async (token, clerkUser) => {
        try {
          const email = clerkUser?.primaryEmailAddress?.emailAddress || "";
          const name = clerkUser?.fullName || "";
          await exchangeClerk(token, email, name);
          window.location.href = "/";
        } catch (err) {
          console.error("SSO callback catch error:", err);
          window.location.href = "/login";
        }
      }}>
        <ClerkSSOCallback/>
      </ClerkAuthWrapper>
    </div>
  );
}

function Spinner() {
  return <div className="h-full grid place-items-center"><div className="pulse text-3xl">💰</div></div>;
}

/** Logged-out users cannot see any app page — only login. */
function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** Logged-in users should not stay on the login screen. */
function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function CatchAll() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? "/" : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/sso-callback" element={<SSOCallbackHandler />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/income" element={<Income />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/fraud" element={<Fraud />} />
        <Route path="/investments" element={<Investments />} />
        <Route path="/market" element={<Market />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/ocr" element={<OCR />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<CatchAll />} />
    </Routes>
  );
}
