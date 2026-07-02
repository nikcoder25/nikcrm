import React, { useState } from "react";
import { getSession, signOut } from "./lib/api";
import { ToastProvider } from "./lib/toast";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [session, setSession] = useState(getSession());

  return (
    <ToastProvider>
      {!session
        ? <Login onLogin={setSession} />
        : <Dashboard session={session} onSignOut={() => { signOut(); setSession(null); }} />}
    </ToastProvider>
  );
}
