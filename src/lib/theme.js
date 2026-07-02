/* ---------------- theme (black + violet + cream) ---------------- */
export const ink = "#17161c";
export const accent = "#6d28d9";
export const cream = "#f6efe0";
export const tint = "#ece7fb";
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
  ::placeholder { color: #a39db5; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: ${accent}; }
  .spin { animation: rot .8s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg); } }
  /* Horizontal scroll container for wide tables/grids: phones swipe sideways
     instead of breaking the layout; a no-op when the content already fits. */
  .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  @media (max-width: 720px) {
    .shell { flex-direction: column; }
    .side { width: 100% !important; height: auto !important; position: static !important; flex-direction: row !important; align-items: center; overflow-x: auto; border-right: none !important; border-bottom: ${BD} !important; }
    .nav { flex-direction: row !important; }
    .ni span { display: none; }
    .board { grid-template-columns: 1fr !important; }
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
