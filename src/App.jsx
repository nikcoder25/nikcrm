import React, { useState } from "react";
import { getSession, signOut } from "./lib/api";
import { useRouter, portalTokenFromPath } from "./lib/router";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Portal from "./components/Portal";

export default function App() {
  const [session, setSession] = useState(getSession());
  const { path } = useRouter();

  // /portal/:token is the public read-only client view — no session involved,
  // so it renders instead of the login/dashboard flow entirely.
  const portalToken = portalTokenFromPath(path);
  if (portalToken) return <Portal token={portalToken} />;

  if (!session) return <Login onLogin={setSession} />;
  return <Dashboard session={session} onSignOut={() => { signOut(); setSession(null); }} />;
}
