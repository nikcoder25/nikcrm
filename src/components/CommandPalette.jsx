import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft, FolderKanban, LayoutDashboard } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, input } from "../lib/theme";
import { STATUS_LABEL } from "../lib/constants";

// Global quick-jump: opens on ⌘K / Ctrl-K, fuzzy-ish filters clients and the
// nav destinations, and navigates on Enter. Keyboard-first (↑/↓/Enter/Esc).
export default function CommandPalette({ open, onClose, clients = [], nav = [], onOpenClient, onGoTab }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Reset query + selection each time it opens, and focus the input.
  useEffect(() => {
    if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = nav
      .filter((n) => !term || n.l.toLowerCase().includes(term))
      .map((n) => ({ kind: "page", key: `page-${n.k}`, label: n.l, sub: "Go to page", icon: n.i || LayoutDashboard, run: () => onGoTab(n.k) }));
    const cs = clients
      .filter((c) => {
        if (!term) return true;
        return (c.name || "").toLowerCase().includes(term) || (c.niche || "").toLowerCase().includes(term);
      })
      .slice(0, 20)
      .map((c) => ({ kind: "client", key: `client-${c.id}`, label: c.name, sub: `${STATUS_LABEL[c.status] || c.status}${c.niche ? " · " + c.niche : ""}`, icon: FolderKanban, run: () => onOpenClient(c) }));
    // Clients first when the user is searching; pages first when the box is empty.
    return term ? [...cs, ...pages] : [...pages, ...cs];
  }, [q, clients, nav, onOpenClient, onGoTab]);

  // Keep the active index in range as the result set shrinks/grows.
  useEffect(() => { setActive((i) => Math.min(i, Math.max(0, results.length - 1))); }, [results.length]);

  const choose = (r) => { if (!r) return; onClose(); r.run(); };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  // Scroll the active row into view on keyboard movement.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(23,22,28,.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12vh 16px 16px", zIndex: 200 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Search"
        style={{ background: "#fff", width: "100%", maxWidth: 560, border: BD, borderRadius: 16, boxShadow: "8px 8px 0 " + ink, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: BD }}>
          <Search size={18} />
          <input
            ref={inputRef}
            style={{ ...input, border: "none", padding: 0, fontSize: 16 }}
            placeholder="Search clients or jump to a page…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            aria-label="Search clients or pages"
          />
          <kbd style={{ fontSize: 10.5, fontWeight: 800, color: "#6b6580", border: BDt, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>ESC</kbd>
        </div>
        <div ref={listRef} style={{ maxHeight: "50vh", overflowY: "auto", padding: 6 }}>
          {results.length === 0 ? (
            <div style={{ padding: "26px 16px", textAlign: "center", color: "#6b6580", fontWeight: 700, fontSize: 13.5 }}>No matches.</div>
          ) : (
            results.map((r, i) => {
              const I = r.icon, on = i === active;
              return (
                <button
                  key={r.key} data-idx={i} type="button"
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(r)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "11px 12px", borderRadius: 10, border: on ? BDt : "2px solid transparent", background: on ? tint : "transparent", cursor: "pointer", font: "inherit", color: ink, marginBottom: 2 }}>
                  <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, background: r.kind === "client" ? accent : "#fff", color: r.kind === "client" ? "#fff" : ink, border: BDt, display: "flex", alignItems: "center", justifyContent: "center" }}><I size={15} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "#6b6580", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
                  </span>
                  {on && <CornerDownLeft size={15} style={{ color: "#6b6580", flexShrink: 0 }} />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
