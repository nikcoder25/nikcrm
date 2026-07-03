import React, { useEffect, useState } from "react";
import { Globe, Plus, Trash2, RefreshCw, Loader, ChevronRight, ArrowLeft, Check } from "lucide-react";
import { ink, accent, disp, BD, BDt, SH, btn, iconBtn } from "../lib/theme";
import { gscSites, gscSiteList, gscSiteAdd, gscSiteRemove, gscSiteData, googleStatus } from "../lib/google";
import { dateLabel } from "../lib/format";
import { useToast } from "../lib/toast";
import { Panel, Empty, Center, Modal } from "./ui";
import { GSC_GRAY, GSC_RED, gscDay, gscWindows, pctChange, GscStat, GscClicksChart, GscQueriesTable } from "./GscBits";

/* ---------------- Websites (per-user Search Console) ----------------
   The tab shows a light LIST of the websites the current user imported; each
   one opens its own page (/websites/:site) with the full numbers — clicks,
   impressions, CTR, average position, the clicks-over-time chart and top
   queries. Importing shows the user's Search Console sites as clickable rows
   (no dropdown). All data comes from the user's own Google connection and is
   cached per site server-side. */

const pct1 = (v) => `${(v * 100).toFixed(1)}%`;

/* ---------- import modal: the user's sites as click-to-add rows ---------- */
function ImportModal({ imported, onAdded, onClose }) {
  const [available, setAvailable] = useState(null); // null = loading
  const [busySite, setBusySite] = useState("");
  const [added, setAdded] = useState(() => new Set());
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    gscSites()
      .then((r) => { if (alive) setAvailable((r.sites || []).map((s) => s.site_url)); })
      .catch((e) => { if (alive) { setAvailable([]); toast(e?.message || "Could not list your Search Console sites.", "error"); } });
    return () => { alive = false; };
  }, []);

  const add = async (site) => {
    setBusySite(site);
    try {
      await gscSiteAdd(site);
      setAdded((s) => new Set(s).add(site));
      onAdded(site);
      toast("Website imported");
    } catch (e) { toast(e?.message || "Could not import the site.", "error"); }
    setBusySite("");
  };

  const candidates = (available || []).filter((s) => !imported.includes(s) || added.has(s));

  return (
    <Modal title="Import a website" onClose={onClose} maxWidth={520}>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: "#6b6580", margin: "2px 0 12px" }}>
        These are the sites on <b>your</b> Search Console account. Click Add on the ones you want on the Websites tab.
      </p>
      {available === null ? (
        <div style={{ padding: "26px 0", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: GSC_GRAY }}>Loading your sites…</div>
      ) : candidates.length === 0 ? (
        <Empty>{available.length === 0 ? "No sites on your Search Console account yet." : "All of your Search Console sites are already imported."}</Empty>
      ) : (
        <div style={{ border: BDt, borderRadius: 10, overflow: "hidden" }}>
          {candidates.map((site) => {
            const done = added.has(site);
            return (
              <div key={site} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #f0ece2" }}>
                <Globe size={15} style={{ color: accent, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{site}</span>
                {done ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: "#1f9d57" }}><Check size={14} /> Added</span>
                ) : (
                  <button style={{ ...btn(accent, "#fff"), padding: "6px 12px", fontSize: 12 }} disabled={busySite === site} onClick={() => add(site)}>
                    {busySite === site ? <Loader size={13} className="spin" /> : <Plus size={13} />} Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* ---------- per-site page (/websites/:site) ---------- */
export function WebsiteDetail({ site, onBack, onRemoved }) {
  // null = loading; { error } = failed; else { daily, queries }.
  const [data, setData] = useState(null);
  const toast = useToast();

  const load = (force = false) => {
    setData(null);
    gscSiteData(site, force)
      .then(setData)
      .catch((e) => setData({ error: e?.message || "Could not load Search Console data." }));
  };
  useEffect(() => { load(); }, [site]);

  const remove = async () => {
    if (!window.confirm(`Remove ${site} from your Websites? (It stays on your Search Console account.)`)) return;
    try { await gscSiteRemove(site); toast("Website removed"); onRemoved(); }
    catch (e) { toast(e?.message || "Could not remove the site.", "error"); }
  };

  let body;
  if (data === null) {
    body = <div style={{ padding: "22px 0", fontSize: 12.5, fontWeight: 700, color: GSC_GRAY }}>Loading Search Console data…</div>;
  } else if (data.error) {
    body = <div style={{ padding: "14px 0", fontSize: 12.5, fontWeight: 700, color: GSC_RED }}>{data.error}</div>;
  } else {
    const daily = (data.daily || []).map(gscDay);
    const w = gscWindows(daily);
    if (!w) {
      body = <div style={{ padding: "14px 0", fontSize: 12.5, fontWeight: 600, color: GSC_GRAY }}>No Search Analytics rows yet — new sites can take a couple of days to report.</div>;
    } else {
      body = (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <GscStat label="Clicks · 28d" value={w.cur.clicks} change={pctChange(w.cur.clicks, w.prev.clicks, w.comparable)} />
            <GscStat label="Impressions · 28d" value={w.cur.impressions} change={pctChange(w.cur.impressions, w.prev.impressions, w.comparable)} />
            <GscStat label="CTR · 28d" value={pct1(w.cur.ctr)} />
            <GscStat label="Avg position · 28d" value={w.cur.position ? w.cur.position.toFixed(1) : "—"} />
          </div>
          {daily.length >= 2 && (
            <div style={{ border: BDt, borderRadius: 12, background: "#faf8f2", padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Daily clicks — last {daily.length} days</div>
              <div className="scroll-x"><GscClicksChart daily={daily} width={860} height={190} /></div>
            </div>
          )}
          <GscQueriesTable queries={data.queries || []} title="Top queries — last 28 days" />
        </>
      );
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: 980, margin: "0 auto" }}>
      <button style={{ ...btn("#fff", ink), marginBottom: 18 }} onClick={onBack}>
        <ArrowLeft size={16} /> Back to websites
      </button>
      <div style={{ background: "#fff", borderRadius: 18, padding: 26, border: BD, boxShadow: SH }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 14, borderBottom: "2px solid #f0ece2", marginBottom: 16 }}>
          <Globe size={18} style={{ color: accent }} />
          <h1 style={{ fontFamily: disp, fontSize: 19, flex: 1, minWidth: 0, wordBreak: "break-all" }}>{site}</h1>
          <button style={{ ...btn("#fff", ink), padding: "8px 12px", fontSize: 12.5 }} disabled={data === null} onClick={() => load(true)}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button style={{ ...btn("#fff", "#c0392b"), padding: "8px 12px", fontSize: 12.5 }} onClick={remove}>
            <Trash2 size={14} /> Remove
          </button>
        </div>
        {body}
        <p style={{ marginTop: 16, fontSize: 11.5, color: GSC_GRAY, fontWeight: 600 }}>
          Last 28 days vs the 28 before; Search Console data lags about two days. Cached server-side for a few hours — Refresh pulls fresh numbers.
        </p>
      </div>
    </div>
  );
}

/* ---------- the Websites tab: a light, clickable list ---------- */
export default function Websites({ onOpen }) {
  const [status, setStatus] = useState(null);     // googleStatus result
  const [imported, setImported] = useState(null); // my imported site URLs
  const [showImport, setShowImport] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, mine] = await Promise.all([googleStatus(), gscSiteList()]);
        if (!alive) return;
        setStatus(s);
        setImported((mine.sites || []).map((r) => ({ site: r.site_url, added: r.added_at })));
      } catch (e) {
        if (alive) { setStatus({}); setImported([]); toast(e?.message || "Could not load your websites.", "error"); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const removeSite = async (site) => {
    if (!window.confirm(`Remove ${site} from this dashboard? (It stays on your Search Console account.)`)) return;
    try { await gscSiteRemove(site); setImported((list) => list.filter((r) => r.site !== site)); toast("Website removed"); }
    catch (e) { toast(e?.message || "Could not remove the site.", "error"); }
  };

  if (status === null || imported === null) return <Center>Loading your websites…</Center>;

  const connected = Boolean(status.user_connected);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <p style={{ flex: 1, minWidth: 240, fontSize: 13, fontWeight: 600, color: "#4b4560" }}>
          Search Console performance for <b>your</b> websites — click one to open its page.
        </p>
        {connected && (
          <button style={btn(accent, "#fff")} onClick={() => setShowImport(true)}>
            <Plus size={15} /> Import a website
          </button>
        )}
      </div>

      {!connected ? (
        <Panel>
          <Empty>
            {status.user_account
              ? "Connect your Google account in Settings first — then import any of your Search Console websites here."
              : "You're signed in with the shared team password. Sign in via My account or Google, connect your Google account in Settings, then import your Search Console websites here."}
          </Empty>
        </Panel>
      ) : imported.length === 0 ? (
        <Panel>
          <Empty action={<button style={{ ...btn(accent, "#fff"), display: "inline-flex" }} onClick={() => setShowImport(true)}><Plus size={15} /> Import a website</button>}>
            No websites yet. Import any site from your Search Console account — each one gets its own page with clicks, impressions and top queries.
          </Empty>
        </Panel>
      ) : (
        <Panel>
          {imported.map(({ site, added }) => (
            <div key={site}
              role="link" tabIndex={0} aria-label={`Open ${site}`}
              onClick={() => onOpen(site)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(site); } }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 20px", borderBottom: "2px solid #f0ece2", cursor: "pointer" }}>
              <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: BDt }}>
                <Globe size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{site}</div>
                {added && <div style={{ fontSize: 11.5, color: GSC_GRAY, fontWeight: 700, marginTop: 1 }}>Imported {dateLabel(added)}</div>}
              </div>
              <button style={iconBtn} title="Remove from this dashboard" aria-label={`Remove ${site}`}
                onClick={(e) => { e.stopPropagation(); removeSite(site); }}>
                <Trash2 size={14} />
              </button>
              <ChevronRight size={18} style={{ color: GSC_GRAY, flexShrink: 0 }} />
            </div>
          ))}
        </Panel>
      )}

      {showImport && (
        <ImportModal
          imported={imported.map((r) => r.site)}
          onAdded={(site) => setImported((list) => (list.some((r) => r.site === site) ? list : [...list, { site, added: null }].sort((a, b) => a.site.localeCompare(b.site))))}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
