/* ---------------- theme (black + violet + cream) ---------------- */
export const ink = "#17161c";
export const accent = "#6d28d9";
export const cream = "#f6efe0";
export const tint = "#ece7fb";
// The dark rail: sidebar + mobile top bar share these so there are no
// mismatched dark-vs-cream seams anywhere in the shell.
export const sideBg = "#241146";
export const sideText = "#c9bdf0";
export const disp = "'Archivo Black','Space Grotesk',sans-serif";

export const BD = `3px solid ${ink}`;
export const BDt = `2.5px solid ${ink}`;
export const SH = `5px 5px 0 ${ink}`;
export const SHs = `3px 3px 0 ${ink}`;

/* ---------------- shared inline-style tokens ---------------- */
export const btn = (bg, fg) => ({ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 9, border: BD, background: bg, color: fg, fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: SHs });
export const moveBtn = (fwd) => ({ flex: 1, padding: "7px 8px", borderRadius: 8, border: BDt, background: fwd ? accent : "#fff", color: fwd ? "#fff" : ink, fontSize: 11.5, fontWeight: 800, cursor: "pointer" });
export const iconBtn = { background: "#fff", border: BDt, borderRadius: 8, padding: 7, cursor: "pointer", color: ink, display: "flex" };
export const sel = { padding: "10px", borderRadius: 9, border: BDt, background: "#fff", fontSize: 13, color: ink, fontWeight: 600, flex: 1, minWidth: 100 };
export const lbl = { display: "block", fontSize: 12.5, fontWeight: 800, color: ink, margin: "13px 0 6px", textTransform: "uppercase", letterSpacing: "0.03em" };
export const input = { width: "100%", padding: "11px 12px", borderRadius: 9, border: BDt, fontSize: 14, boxSizing: "border-box", color: ink, fontWeight: 600, fontFamily: "inherit" };
export const overlay = { position: "fixed", inset: 0, background: "rgba(23,22,28,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 };
// maxWidth is min()-capped so every modal fits phones (overlay pads 16px per
// side); on desktop min() resolves to the px cap, so nothing changes there.
export const modal = { background: "#fff", borderRadius: 18, padding: 26, width: "100%", maxWidth: "min(480px, calc(100vw - 32px))", maxHeight: "90vh", overflowY: "auto", border: BD, boxShadow: "8px 8px 0 " + ink };

export const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&family=Archivo+Black&display=swap');
  * { margin: 0; box-sizing: border-box; }
  h1, h2, h3, h4 { margin: 0; font-weight: inherit; }
  /* A select's intrinsic width is its longest <option> (e.g. a long client
     name), which punches through flex rows on phones — cap every form control
     at its container so toolbars can never cause horizontal overflow. */
  select, input, textarea { max-width: 100%; }
  ::placeholder { color: #a39db5; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: ${accent}; }
  button:focus-visible, a:focus-visible, [tabindex]:focus-visible { outline: 3px solid ${accent}; outline-offset: 2px; }
  .spin { animation: rot .8s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg); } }
  /* Mic button while dictating: a soft red ring pulse. */
  @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(192,57,43,.5); } 50% { box-shadow: 0 0 0 6px rgba(192,57,43,0); } }
  /* Horizontal scroll container for wide tables/grids: phones swipe sideways
     instead of breaking the layout; a no-op when the content already fits. */
  .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .kpi-click { transition: transform .08s ease, box-shadow .08s ease; }
  .kpi-click:hover { transform: translate(-1px,-1px); box-shadow: 7px 7px 0 ${ink}; }

  /* Sidebar nav items (.ni): a focus ring only for KEYBOARD navigation, never
     a lingering one after a mouse click. White, not the accent — the global
     accent ring is nearly invisible on the dark purple rail. Same 3px/offset
     geometry as the app-wide focus ring. */
  .ni:focus { outline: none; }
  .ni:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }

  /* ---------------- app shell ----------------
     The shell is exactly one viewport tall and never scrolls itself; the MAIN
     column is the only vertical scroller. The sidebar is its own full-height
     column that scrolls internally when its items overflow — page scrolling
     can never move it or reveal the cream background beneath it. (dvh with a
     vh fallback so mobile browser chrome doesn't leave a dead strip.) */
  .shell { display: flex; height: 100vh; height: 100dvh; overflow: hidden; }
  .side {
    width: 244px; flex-shrink: 0; height: 100%;
    display: flex; flex-direction: column;
    overflow-y: auto; overscroll-behavior: contain;
  }
  .main {
    flex: 1; min-width: 0; height: 100%;
    display: flex; flex-direction: column;
    overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch;
  }

  /* Page padding shared by every screen; tightens on small viewports. */
  .page-pad { padding: 28px; }
  .page-head { padding: 20px 28px; }

  /* Two-column form rows stack on narrow phones. */
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* Mobile top app bar (hidden on desktop). */
  .mobbar { display: none; }
  .side-backdrop { display: none; }

  /* Tablet & phone: the sidebar becomes an off-canvas drawer over a dimmed
     backdrop, opened from the hamburger in the top app bar. */
  @media (max-width: 1024px) {
    .mobbar { display: flex !important; }
    .side {
      position: fixed; left: 0; top: 0; height: 100vh; height: 100dvh; width: 280px;
      z-index: 130; transform: translateX(-100%); transition: transform .2s ease;
    }
    .side.open { transform: translateX(0); box-shadow: 8px 0 0 rgba(0,0,0,.35); }
    .side-backdrop.show { display: block; position: fixed; inset: 0; background: rgba(23,22,28,.5); z-index: 120; }
  }
  @media (max-width: 768px) {
    .page-pad { padding: 14px 12px 32px; }
    .page-head { padding: 14px 16px; }
    .board { grid-template-columns: 1fr !important; }
    .form-row { grid-template-columns: 1fr; }
    /* 16px inputs stop iOS Safari from zooming the page on focus. */
    input, select, textarea { font-size: 16px !important; }
  }
  .print-only { display: none; }
  @media print {
    /* Print only the report: hide everything, then reveal .ga-print. */
    body * { visibility: hidden; }
    .ga-print, .ga-print * { visibility: visible; }
    .ga-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 6px; box-shadow: none !important; border: none !important; }
    .scroll-x { overflow: visible !important; }
    .scroll-x > table { min-width: 0 !important; }
    .no-print { display: none !important; }
    .print-only { display: block !important; }
    @page { margin: 14mm; }
  }
`;
