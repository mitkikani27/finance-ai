import React from "react";
import { ClerkProvider, useUser, useSession, AuthenticateWithRedirectCallback, useSignIn, SignInButton } from "@clerk/clerk-react";

export const CLERK_PK = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

export async function signOutClerk() {
  try {
    if (typeof window !== "undefined" && window.Clerk && typeof window.Clerk.signOut === "function") {
      await window.Clerk.signOut();
    }
  } catch (err) {
    console.warn("Clerk sign-out warning:", err);
  }
}

class ClerkErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function ClerkBridge({ onAuthenticated }) {
  const { isSignedIn, user } = useUser();
  const { session } = useSession();
  const doneRef = React.useRef(null);

  React.useEffect(() => {
    if (!onAuthenticated) return;
    (async () => {
      if (!isSignedIn || !session || doneRef.current === session.id) return;
      doneRef.current = session.id;
      try {
        console.log("Clerk session active. Exchanging token...");
        const clerkToken = await session.getToken();
        console.log("Got Clerk token, sending to backend...");
        await onAuthenticated(clerkToken, user);
      } catch (err) {
        console.error("Clerk token exchange failed:", err);
        window.location.href = "/login?error=clerk-exchange-failed";
      }
    })();
  }, [isSignedIn, session, onAuthenticated]);

  return null;
}

export function ClerkGoogleButton() {
  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className="btn w-full !py-2.5 flex justify-center items-center gap-2 hover:opacity-95 active:scale-[0.99] transition cursor-pointer"
        style={{ background: "white", color: "#1f2937", border: "1px solid #d1d5db", fontWeight: 600 }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C40.9 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"/>
        </svg>
        Continue with Google
      </button>
    </SignInButton>
  );
}

export function ClerkAuthWrapper({ children }) {
  if (!CLERK_PK) return <>{children}</>;
  
  return (
    <ClerkErrorBoundary fallback={<>{children}</>}>
      <ClerkProvider publishableKey={CLERK_PK}>
        {children}
      </ClerkProvider>
    </ClerkErrorBoundary>
  );
}

export function ClerkSSOCallback() {
  return (
    <AuthenticateWithRedirectCallback />
  );
}
