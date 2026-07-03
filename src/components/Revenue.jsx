import React, { useState, useRef, useEffect } from "react";
import { DollarSign, Wallet, Check, Download, Link2, ExternalLink, TrendingUp, Users, Package, ClipboardCheck, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, SH, sel, btn, iconBtn } from "../lib/theme";
import { PAY_STATES, STATUS_LABEL } from "../lib/constants";
import { money, ym, ymLabel } from "../lib/format";
import { downloadCsv, paymentsCsv } from "../lib/csv";
import { createPaymentLink } from "../lib/api";
import { Panel, Empty } from "./ui";
import { monthKeys, revenueByMonth, clientsByMonth, ordersByMonth, pipelineFunnel, revenueBySource, deltaPct } from "../lib/revenueStats";

const GRAY = "#6b6580";
const MUTED = "#a39db5";
const GREEN = "#1f9d57";
const AMBER = "#f0b429";
const TEAL = "#0e9aa7";
// Same status palette as the Overview client-book bar.
const STATUS_COLOR = { lead: "#f0b429", upcoming: "#8b5cf6", active: "#6d28d9", paused: "#94a3b8", ended: "#64748b", loss: "#c0392b" };

const prevMonthOf = (m) => { const [y, mo] = String(m).split("-").map(Number); return ym(new Date(y, mo - 2, 1)); };
const monthShort = (m) => { const [y, mo] = String(m).split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleString("en", { month: "short" }); };

/* ---------------- KPI card with month-over-month delta ---------------- */
function Kpi({ icon: I, label, value, delta, hint }) {
  const up = delta != null && delta > 0, down = delta != null && delta < 0;
  const dColor = up ? GREEN : down ? "#c0392b" : GRAY;
  const D = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div style={{ background: "#fff", border: BD, borderRadius: 14, boxShadow: SH, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: BDt, flexShrink: 0 }}><I size={16} /></div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 24, fontWeight: 900, fontFamily: disp }}>{value}</span>
        {delta != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 800, color: dColor }}>
            <D size={13} />{Math.abs(delta)}%
          </span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: GRAY, fontWeight: 600, marginTop: 2 }}>{hint}</div>
    </div>
  );
}

/* ---------------- monthly chart: grouped bars (+ optional trend line) ----------------
   Width tracks the card so all 12 months fit without horizontal scrolling and
   the axis text stays at its natural size. */
function MonthChart({ months, bars = [], line = null, money: isMoney = false, height = 190 }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(Math.max(300, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hasLine = Boolean(line);
  const padL = 48, padR = hasLine ? 44 : 14, padT = 12, padB = 24;
  const iw = width - padL - padR, ih = height - padT - padB;
  const n = Math.max(1, months.length);
  const slot = iw / n;
  const barMax = Math.max(1, ...bars.flatMap((b) => b.values));
  const lineMax = hasLine ? Math.max(1, ...line.values) : 1;
  const yL = (v) => padT + (1 - v / barMax) * ih;
  const yR = (v) => padT + (1 - v / lineMax) * ih;
  const cx = (i) => padL + slot * i + slot / 2;
  const base = yL(0);
  const groupW = slot * 0.6;
  const bw = groupW / Math.max(1, bars.length);
  const fmtL = (v) => (isMoney ? (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`) : String(Math.round(v)));
  const yTicks = [...new Set([0, Math.round(barMax / 2), Math.round(barMax)])];
  const rTicks = hasLine ? [...new Set([0, Math.round(lineMax / 2), Math.round(lineMax)])] : [];
  return (
    <div ref={ref} style={{ width: "100%" }}>
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={padL} x2={width - padR} y1={yL(v)} y2={yL(v)} stroke="#e8e4d8" strokeWidth="1" />
          <text x={padL - 7} y={yL(v) + 3.5} textAnchor="end" fontSize="10" fontWeight="700" fill={GRAY}>{fmtL(v)}</text>
        </g>
      ))}
      {rTicks.map((v) => (
        <text key={`r${v}`} x={width - padR + 7} y={yR(v) + 3.5} textAnchor="start" fontSize="10" fontWeight="700" fill={line.color}>{v}</text>
      ))}
      {months.map((m, i) => (
        <text key={`x${m}`} x={cx(i)} y={height - 8} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={GRAY}>{monthShort(m)}</text>
      ))}
      {months.map((m, i) => bars.map((b, bi) => {
        const v = b.values[i] || 0;
        const x = cx(i) - groupW / 2 + bi * bw;
        const y = yL(v);
        return <rect key={`${m}-${bi}`} x={x + 1} y={y} width={Math.max(1, bw - 2)} height={Math.max(0, base - y)} rx="2" fill={b.color}>
          <title>{`${b.label} · ${monthShort(m)}: ${isMoney ? money(v) : v}`}</title>
        </rect>;
      }))}
      {hasLine && <path d={months.map((m, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${yR(line.values[i] || 0).toFixed(1)}`).join(" ")}
        fill="none" stroke={line.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {hasLine && months.map((m, i) => <circle key={`c${m}`} cx={cx(i)} cy={yR(line.values[i] || 0)} r="2.5" fill={line.color} />)}
    </svg>
    </div>
  );
}

const Swatch = ({ color, label, line }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, color: GRAY }}>
    <span style={{ width: line ? 14 : 10, height: line ? 3 : 10, borderRadius: line ? 2 : 3, background: color }} /> {label}
  </span>
);

function ChartCard({ title, legend, children }) {
  return (
    <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ fontFamily: disp, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.03em" }}>{title}</h2>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>{legend}</div>
      </div>
      {children}
    </div>
  );
}

/* ---------------- Revenue ---------------- */
export default function Revenue({ clients, payments, orders = [], month, setMonth, onSet, isAdmin = false }) {
  const [linkErr, setLinkErr] = useState("");
  const [stripeOff, setStripeOff] = useState(false);
  const [linkBusy, setLinkBusy] = useState("");
  const [linkMsg, setLinkMsg] = useState({ key: "", text: "" });
  const [linkUrls, setLinkUrls] = useState({});

  const active = clients.filter((c) => c.status === "active");
  const mrr = active.reduce((s, c) => s + (Number(c.fee) || 0), 0);

  // 12-month backbone for the trend charts + ledger.
  const months = monthKeys(12);
  const rev = revenueByMonth(payments, months);
  const cli = clientsByMonth(clients, months);
  const ord = ordersByMonth(orders, months);
  const funnel = pipelineFunnel(clients);
  const bySource = revenueBySource(clients);
  const rowByMonth = Object.fromEntries(months.map((m, i) => [m, { m, rev: rev[i], cli: cli[i], ord: ord[i] }]));

  // KPIs: the selected month vs the one before it (computed directly so it works
  // even for a month outside the 12-window).
  const kMonths = [prevMonthOf(month), month];
  const [rPrev, rCur] = revenueByMonth(payments, kMonths);
  const [cPrev, cCur] = clientsByMonth(clients, kMonths);
  const [oPrev, oCur] = ordersByMonth(orders, kMonths);

  /* ---- per-client payment tracker for the selected month (unchanged) ---- */
  const payOf = (cid) => payments.find((p) => p.client_id === cid && p.month === month);
  const monthPays = active.map((c) => {
    const p = payOf(c.id);
    return { client: c, amount: p ? Number(p.amount) : Number(c.fee) || 0, status: p ? p.status : "pending", linkUrl: p?.stripe_link_url || linkUrls[c.id + "|" + month] || "" };
  });

  const flashMsg = (key, text) => { setLinkMsg({ key, text }); setTimeout(() => setLinkMsg((mm) => (mm.key === key ? { key: "", text: "" } : mm)), 1800); };
  const payLink = async (client, linkUrl) => {
    const key = client.id + "|" + month;
    setLinkErr("");
    try {
      if (linkUrl) { await navigator.clipboard.writeText(linkUrl); flashMsg(key, "Copied!"); return; }
      setLinkBusy(key);
      const { url } = await createPaymentLink(client.id, month);
      setLinkUrls((mm) => ({ ...mm, [key]: url }));
      await navigator.clipboard.writeText(url);
      flashMsg(key, "Link created & copied");
    } catch (e) {
      if (e?.status === 503) setStripeOff(true);
      setLinkErr(e?.message || "Could not create the payment link.");
    }
    setLinkBusy("");
  };

  const monthOptions = (() => {
    const set = new Set([month, ...months]);
    payments.forEach((p) => set.add(p.month));
    return [...set].sort().reverse();
  })();

  const totalClients = clients.length || 1;
  const cell = { fontSize: 12.5, fontWeight: 700, textAlign: "right" };
  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em", padding: "9px 12px" };
  const LEDGER_GRID = `minmax(80px,1fr) repeat(${isAdmin ? 6 : 5}, minmax(72px,1fr))`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button style={btn("#fff", ink)} disabled={payments.length === 0} onClick={() => downloadCsv("payments.csv", paymentsCsv(payments, clients))}>
          <Download size={15} /> Export CSV
        </button>
        <select style={{ ...sel, flex: "none", minWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Revenue month">
          {monthOptions.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
        </select>
      </div>

      {/* KPI row — selected month vs the month before */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 18 }}>
        <Kpi icon={DollarSign} label="MRR (now)" value={money(mrr)} hint={`${active.length} active clients`} />
        <Kpi icon={Check} label={`Collected · ${ymLabel(month)}`} value={money(rCur.collected)} delta={deltaPct(rCur.collected, rPrev.collected)} hint="vs last month" />
        <Kpi icon={Wallet} label={`Pending · ${ymLabel(month)}`} value={money(rCur.pending)} hint="not yet paid" />
        <Kpi icon={Users} label="New clients" value={String(cCur.added)} delta={deltaPct(cCur.added, cPrev.added)} hint={`${cCur.total} total in book`} />
        <Kpi icon={Package} label="Orders started" value={String(oCur.started)} delta={deltaPct(oCur.started, oPrev.started)} hint="vs last month" />
        <Kpi icon={ClipboardCheck} label="Orders delivered" value={String(oCur.delivered)} delta={deltaPct(oCur.delivered, oPrev.delivered)} hint="this month" />
        {isAdmin && <Kpi icon={TrendingUp} label="Order value" value={money(oCur.value)} delta={deltaPct(oCur.value, oPrev.value)} hint="started this month" />}
      </div>

      {/* Trend charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, marginBottom: 16, alignItems: "start" }}>
        <ChartCard title="Revenue · last 12 months" legend={<><Swatch color={GREEN} label="Collected" /><Swatch color={AMBER} label="Pending" /></>}>
          <MonthChart months={months} money bars={[
            { label: "Collected", color: GREEN, values: rev.map((r) => r.collected) },
            { label: "Pending", color: AMBER, values: rev.map((r) => r.pending) },
          ]} />
        </ChartCard>

        <ChartCard title="Order flow · last 12 months" legend={<><Swatch color={accent} label="Started" /><Swatch color={TEAL} label="Delivered" /></>}>
          <MonthChart months={months} bars={[
            { label: "Started", color: accent, values: ord.map((o) => o.started) },
            { label: "Delivered", color: TEAL, values: ord.map((o) => o.delivered) },
          ]} />
        </ChartCard>

        <ChartCard title="Client growth · last 12 months" legend={<><Swatch color={accent} label="New / month" /><Swatch color={ink} label="Total book" line /></>}>
          <MonthChart months={months}
            bars={[{ label: "New clients", color: accent, values: cli.map((c) => c.added) }]}
            line={{ label: "Total", color: ink, values: cli.map((c) => c.total) }} />
        </ChartCard>

        {isAdmin && (
          <ChartCard title="New order value · last 12 months" legend={<Swatch color={GREEN} label="Value started" />}>
            <MonthChart months={months} money bars={[{ label: "Order value", color: GREEN, values: ord.map((o) => o.value) }]} />
          </ChartCard>
        )}
      </div>

      {/* Pipeline funnel + revenue by source */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, marginBottom: 16, alignItems: "start" }}>
        <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 18 }}>
          <h2 style={{ fontFamily: disp, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 12 }}>Client pipeline</h2>
          {clients.length === 0 ? <span style={{ color: GRAY, fontWeight: 600 }}>No clients yet.</span> : (
            <>
              <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", border: BDt }}>
                {funnel.filter((f) => f.count > 0).map((f) => (
                  <div key={f.status} title={`${STATUS_LABEL[f.status]}: ${f.count}`} style={{ width: `${(f.count / totalClients) * 100}%`, background: STATUS_COLOR[f.status] }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
                {funnel.map((f) => (
                  <span key={f.status} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, border: BDt, background: STATUS_COLOR[f.status] }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{STATUS_LABEL[f.status]}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 900, fontFamily: disp }}>{f.count}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 18 }}>
          <h2 style={{ fontFamily: disp, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 12 }}>MRR by source</h2>
          {bySource.length === 0 ? <span style={{ color: GRAY, fontWeight: 600 }}>No active revenue.</span> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {bySource.map(({ source, mrr: v }) => (
                <div key={source}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 800, marginBottom: 3 }}>
                    <span>{source}</span><span>{money(v)}/mo</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 5, background: "#f0ece2", overflow: "hidden" }}>
                    <div style={{ width: `${mrr > 0 ? (v / mrr) * 100 : 0}%`, height: "100%", background: source === "Fiverr" ? accent : ink }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Month-by-month ledger */}
      <Panel>
        <h2 style={{ padding: "16px 20px", fontFamily: disp, fontSize: 15, textTransform: "uppercase", borderBottom: BD }}>Month by month</h2>
        <div className="scroll-x">
          <div style={{ minWidth: isAdmin ? 720 : 620 }}>
            <div style={{ display: "grid", gridTemplateColumns: LEDGER_GRID, borderBottom: "2px solid #f0ece2" }}>
              <span style={{ ...th, textAlign: "left" }}>Month</span>
              <span style={{ ...th, textAlign: "right" }}>Collected</span>
              <span style={{ ...th, textAlign: "right" }}>Pending</span>
              <span style={{ ...th, textAlign: "right" }}>New</span>
              <span style={{ ...th, textAlign: "right" }}>Started</span>
              <span style={{ ...th, textAlign: "right" }}>Delivered</span>
              {isAdmin && <span style={{ ...th, textAlign: "right" }}>Order value</span>}
            </div>
            {[...months].reverse().map((m) => {
              const r = rowByMonth[m];
              return (
                <div key={m} style={{ display: "grid", gridTemplateColumns: LEDGER_GRID, alignItems: "center", padding: "2px 0", borderBottom: "1px solid #f0ece2", background: m === month ? tint : "transparent" }}>
                  <button onClick={() => setMonth(m)} title="View this month's payments"
                    style={{ ...th, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: m === month ? accent : ink, fontFamily: "inherit" }}>{ymLabel(m)}</button>
                  <span style={{ ...cell, padding: "10px 12px", color: r.rev.collected ? GREEN : MUTED }}>{r.rev.collected ? money(r.rev.collected) : "—"}</span>
                  <span style={{ ...cell, padding: "10px 12px", color: r.rev.pending ? ink : MUTED }}>{r.rev.pending ? money(r.rev.pending) : "—"}</span>
                  <span style={{ ...cell, padding: "10px 12px", color: r.cli.added ? ink : MUTED }}>{r.cli.added || "—"}</span>
                  <span style={{ ...cell, padding: "10px 12px", color: r.ord.started ? ink : MUTED }}>{r.ord.started || "—"}</span>
                  <span style={{ ...cell, padding: "10px 12px", color: r.ord.delivered ? ink : MUTED }}>{r.ord.delivered || "—"}</span>
                  {isAdmin && <span style={{ ...cell, padding: "10px 12px", fontWeight: 900, color: r.ord.value ? ink : MUTED }}>{r.ord.value ? money(r.ord.value) : "—"}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* Per-client payment tracker for the selected month */}
      <div style={{ marginTop: 16 }}>
        <Panel>
          <h2 style={{ padding: "16px 20px", fontFamily: disp, fontSize: 15, textTransform: "uppercase", borderBottom: BD }}>Payments · {ymLabel(month)}</h2>
          {linkErr && <div style={{ background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, margin: "12px 20px 0" }}>{linkErr}</div>}
          {active.length === 0 ? <Empty>No active clients.</Empty> : monthPays.map(({ client, status, linkUrl }) => (
            <div key={client.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "2px solid #f0ece2", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{client.name}</div>
                <div style={{ fontSize: 12.5, color: GRAY, fontWeight: 600 }}>{client.source} · {money(client.fee)}/mo</div>
              </div>
              {status !== "paid" && !stripeOff && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => payLink(client, linkUrl)} disabled={linkBusy === client.id + "|" + month}
                    title={linkUrl ? "Copy the Stripe payment link" : "Create a Stripe payment link and copy it"}
                    style={{ ...iconBtn, alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, padding: "6px 9px",
                      color: linkMsg.key === client.id + "|" + month ? accent : ink,
                      opacity: linkBusy === client.id + "|" + month ? 0.6 : 1 }}>
                    <Link2 size={13} />
                    {linkMsg.key === client.id + "|" + month ? linkMsg.text : linkBusy === client.id + "|" + month ? "Creating…" : "Payment link"}
                  </button>
                  {linkUrl && (
                    <a href={linkUrl} target="_blank" rel="noreferrer" title="Open the payment link" style={{ ...iconBtn, padding: 6, textDecoration: "none" }}>
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                {PAY_STATES.map((ps) => (
                  <button key={ps.key} onClick={() => onSet(client.id, month, { amount: Number(client.fee) || 0, status: ps.key })}
                    style={{ padding: "7px 12px", borderRadius: 8, border: BDt, cursor: "pointer", fontSize: 12, fontWeight: 800,
                      background: status === ps.key ? (ps.key === "paid" ? accent : ink) : "#fff",
                      color: status === ps.key ? "#fff" : ink }}>
                    {ps.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
