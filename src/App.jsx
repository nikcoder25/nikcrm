import React, { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabaseClient";
import { Center } from "./components/ui";
import SetupNeeded from "./components/SetupNeeded";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <SetupNeeded />;
  if (!ready) return <Center>Loading...</Center>;
  return session ? <Dashboard session={session} /> : <Login />;
}
