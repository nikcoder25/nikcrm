import React, { useState } from "react";
import { getSession, signOut, consumeSsoRedirect } from "./lib/api";
import { useRouter, portalTokenFromPath } from "./lib/router";
import { ToastProvider } from "./lib/toast";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Portal from "./components/Portal";

export default function App() {
  // A "Sign in with Google" redirect lands with a session token in the URL
  // fragment — consume it (this persists it and scrubs the URL) before falling
  // back to the stored session.
  const [session, setSession] = useState(() => consumeSsoRedirect() || getSession());
  const { path } = useRouter();

  // /portal/:token is the public read-only client view — no session involved,
  // so it renders instead of the login/dashboard flow entirely.
  const portalToken = portalTokenFromPath(path);
  if (portalToken) return <Portal token={portalToken} />;

  return (
    <ToastProvider>
      {!session
        ? <Login onLogin={setSession} />
        : <Dashboard session={session} onSignOut={() => { signOut(); setSession(null); }} />}
    </ToastProvider>
  );
}
