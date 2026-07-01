import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True only when both env vars are present. The app checks this before using
// Supabase so a missing/unfilled .env shows a setup screen instead of a blank page.
export const supabaseConfigured = Boolean(url && key);

if (!supabaseConfigured) {
  console.warn("Missing Supabase env vars. Copy .env.example to .env and fill it in.");
}

// Passing placeholder values when unconfigured keeps createClient from throwing
// at import time (which would crash the whole app before the setup screen renders).
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  key || "placeholder-anon-key"
);
