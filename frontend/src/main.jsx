import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { LanguageProvider } from "./i18n.jsx";
import { ClerkAuthWrapper } from "./clerk.jsx";
import "./index.css";

// PWA: register the service worker (installable app + offline shell on phones).
// Silently skips where SW is unavailable (e.g. sandboxed preview iframes).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ClerkAuthWrapper>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </ClerkAuthWrapper>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);
