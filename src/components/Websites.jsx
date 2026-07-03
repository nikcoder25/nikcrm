import React, { useEffect, useState } from "react";
import { Globe, Plus, Trash2, RefreshCw, Loader } from "lucide-react";
import { ink, accent, disp, BD, BDt, btn, iconBtn, input } from "../lib/theme";
import { gscSites, gscSiteList, gscSiteAdd, gscSiteRemove, gscSiteData, googleStatus } from "../lib/google";
import { useToast } from "../lib/toast";
import { Panel, Empty, Center } from "./ui";
import { GSC_GRAY, GSC_RED, gscDay, gscWindows, pctChange, GscStat, GscClicksChart, GscQueriesTable } from "./GscBits";

/* ---------------- Websites (per-user Search Console dashboard) ----------------
   Every Search Console site the CURRENT user imported, with clicks,
   impressions, CTR, average position, a clicks-over-time chart and top
   queries. All numbers come from the user's own Google connection; the server
   caches per site, so refreshes are cheap. */

const pct1 = (v) => `${(v * 100).toFixed(1)}%`;

function SiteCard({ site, onRemove }) {
  // null = loading; { error } = failed; else { daily, queries }.
  const [data, setData] = useState(null);

  const load = (force = false) => {
    setData(null);
    gscSiteData(site, force)
      .then(setData)
      .catch((e) => setData({ error: e?.message || "Could not load Search Console data." }));
  };
  useEffect(() => { load(); }, [site]);

  let body;
  if (data === null) {
    body = <div style={{ padding: "18px 0", fontSize: 12.5, fontWeight: 700, color: GSC_GRAY }}>Loading…</div>;
  } else if (data.error) {
    body = <div style={{ padding: "12px 0", fontSize: 12.5, fontWeight: 700, color: GSC_RED }}>{data.error}</div>;
  } else {
    const daily = (data.daily || []).map(gscDay);
    const w = gscWindows(daily);
    if (!w) {
      body = <div style={{ padding: "12px 0", fontSize: 12.5, fontWeight: 600, color: GSC_GRAY }}>No Search Analytics rows yet — new sites can take a couple of days to report.</div>;
    } else {
      body = (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <GscStat label="Clicks · 28d" value={w.cur.clicks} change={pctChange(w.cur.clicks, w.prev.clicks, w.comparable)} />
            <GscStat label="Impressions · 28d" value={w.cur.impressions} change={pctChange(w.cur.impressions, w.prev.impressions, w.comparable)} />
            <GscStat label="CTR · 28d" value={pct1(w.cur.ctr)} />
            <GscStat label="Avg position · 28d" value={w.cur.position ? w.cur.position.toFixed(1) : "—"} />
          </div>
          {daily.length >= 2 && (
            <div style={{ border: BDt, borderRadius: 12, background: "#faf8f2", padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Daily clicks — last {daily.length} days</div>
              <div className="scroll-x"><GscClicksChart daily={daily} /></div>
            </div>
          )}
          <GscQueriesTable queries={data.queries || []} title="Top queries — last 28 days" />
        </>
      );
    }
  }

  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: BD }}>
        <Globe size={16} />
        <h2 style={{ fontFamily: disp, fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{site}</h2>
        <button style={iconBtn} title="Refresh from Search Console" aria-label={`Refresh ${site}`} disabled={data === null}
          onClick={() => load(true)}>
          <RefreshCw size={14} />
        </button>
        <button style={iconBtn} title="Remove from this dashboard" aria-label={`Remove ${site}`} onClick={() => onRemove(site)}>
          <Trash2 size={14} />
        </button>
      </div>
      <div style={{ padding: "14px 20px" }}>{body}</div>
    </Panel>
  );
}

export default function Websites() {
  const [status, setStatus] = useState(null);   // googleStatus result
  const [imported, setImported] = useState(null); // my imported site URLs
  const [available, setAvailable] = useState(null); // null = picker closed
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, mine] = await Promise.all([googleStatus(), gscSiteList()]);
        if (!alive) return;
        setStatus(s);
        setImported((mine.sites || []).map((r) => r.site_url));
      } catch (e) {
        if (alive) { setStatus({}); setImported([]); toast(e?.message || "Could not load your websites.", "error"); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const openPicker = async () => {
    setBusy(true);
    try { const r = await gscSites(); setAvailable((r.sites || []).map((s) => s.site_url)); }
    catch (e) { toast(e?.message || "Could not list your Search Console sites.", "error"); }
    setBusy(false);
  };
  const addSite = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await gscSiteAdd(pick);
      setImported((list) => (list.includes(pick) ? list : [...list, pick].sort()));
      setPick(""); setAvailable(null);
      toast("Website imported");
    } catch (e) { toast(e?.message || "Could not import the site.", "error"); }
    setBusy(false);
  };
  const removeSite = async (site) => {
    if (!window.confirm(`Remove ${site} from this dashboard? (It stays on your Search Console account.)`)) return;
    try { await gscSiteRemove(site); setImported((list) => list.filter((s) => s !== site)); toast("Website removed"); }
    catch (e) { toast(e?.message || "Could not remove the site.", "error"); }
  };

  if (status === null || imported === null) return <Center>Loading your websites…</Center>;

  const connected = Boolean(status.user_connected);
  const notImported = (available || []).filter((s) => !imported.includes(s));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <p style={{ flex: 1, minWidth: 240, fontSize: 13, fontWeight: 600, color: "#4b4560" }}>
          Search Console performance for <b>your</b> websites — imported with your own Google connection, independent of any client.
        </p>
        {connected && (available === null ? (
          <button style={btn(accent, "#fff")} disabled={busy} onClick={openPicker}>
            {busy ? <Loader size={15} className="spin" /> : <Plus size={15} />} Import a website
          </button>
        ) : (
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ ...input, width: "auto", minWidth: 200 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Your Search Console sites">
              <option value="">{notImported.length ? "Pick one of your sites…" : "All your sites are already here"}</option>
              {notImported.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button style={btn(accent, "#fff")} disabled={busy || !pick} onClick={addSite}><Plus size={15} /> Add</button>
            <button style={btn("#fff", ink)} onClick={() => { setAvailable(null); setPick(""); }}>Cancel</button>
          </span>
        ))}
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
          <Empty action={
            available === null
              ? <button style={{ ...btn(accent, "#fff"), display: "inline-flex" }} disabled={busy} onClick={openPicker}><Plus size={15} /> Import a website</button>
              : null
          }>
            No websites yet. Import any site from your Search Console account to see its clicks, impressions and top queries.
          </Empty>
        </Panel>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {imported.map((site) => <SiteCard key={site} site={site} onRemove={removeSite} />)}
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 12, color: GSC_GRAY, fontWeight: 600 }}>
        Numbers cover the last 28 days (vs the 28 before); Search Console data lags about two days. Results are cached server-side for a few hours — use a card's refresh button to pull fresh data.
      </p>
    </div>
  );
}
