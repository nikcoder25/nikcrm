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

// /clients/:id or /clients/:id/:tab -> ":id" (string); any other path -> null.
export function clientIdFromPath(path) {
  const m = /^\/clients\/([^/]+)(?:\/([^/]+))?\/?$/.exec(path || "");
  return m ? decodeURIComponent(m[1]) : null;
}

// /clients/:id/:tab -> ":tab" (string); /clients/:id (no tab) or any other
// path -> null. The client workspace maps this onto its tab bar so each tab
// is linkable and survives a refresh.
export function clientTabFromPath(path) {
  const m = /^\/clients\/([^/]+)\/([^/]+)\/?$/.exec(path || "");
  return m ? decodeURIComponent(m[2]) : null;
}

// The default tab ("overview") stays off the URL so existing /clients/:id
// links keep working and there's exactly one canonical URL for it.
export const clientPath = (id, tab) =>
  `/clients/${encodeURIComponent(id)}` + (tab && tab !== "overview" ? `/${encodeURIComponent(tab)}` : "");

// /websites/:site -> the decoded site URL; any other path -> null. Site URLs
// (sc-domain:example.com, https://example.com/) are URI-encoded into a single
// path segment so each imported website gets its own linkable page.
export function websiteFromPath(path) {
  const m = /^\/websites\/([^/]+)\/?$/.exec(path || "");
  return m ? decodeURIComponent(m[1]) : null;
}

export const websitePath = (site) => `/websites/${encodeURIComponent(site)}`;

// /portal/:token -> ":token" (string); any other path -> null. The public
// read-only client portal renders instead of the login/dashboard flow.
export function portalTokenFromPath(path) {
  const m = /^\/portal\/([^/]+)\/?$/.exec(path || "");
  return m ? decodeURIComponent(m[1]) : null;
}

export const portalPath = (token) => `/portal/${encodeURIComponent(token)}`;
