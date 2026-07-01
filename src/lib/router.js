// Minimal History-API router. We deliberately avoid a routing library:
// the app only needs one real deep-linkable route (the client detail page),
// and netlify.toml already rewrites every path to index.html so refreshing
// or opening /clients/:id directly works without extra server config.
import { useCallback, useEffect, useState } from "react";

export function useRouter() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to !== window.location.pathname) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", to);
    }
    setPath(to);
  }, []);

  return { path, navigate };
}

// /clients/:id -> ":id" (string) for any other path -> null.
export function clientIdFromPath(path) {
  const m = /^\/clients\/([^/]+)\/?$/.exec(path || "");
  return m ? decodeURIComponent(m[1]) : null;
}

export const clientPath = (id) => `/clients/${encodeURIComponent(id)}`;
