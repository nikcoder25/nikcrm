import React, { useState } from "react";
import { getSession, signOut } from "./lib/api";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [session, setSession] = useState(getSession());

  if (!session) return <Login onLogin={setSession} />;
  return <Dashboard session={session} onSignOut={() => { signOut(); setSession(null); }} />;
}
