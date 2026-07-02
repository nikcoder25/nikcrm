import React from "react";
import { DollarSign, Wallet, Check, Download } from "lucide-react";
import { ink, accent, disp, BD, BDt, SH, sel, btn } from "../lib/theme";
import { PAY_STATES } from "../lib/constants";
import { money, ym, ymLabel } from "../lib/format";
import { downloadCsv, paymentsCsv } from "../lib/csv";
import { Panel, Empty, RevCard } from "./ui";

/* ---------------- Revenue ---------------- */
export default function Revenue({ clients, payments, month, setMonth, onSet }) {
  const active = clients.filter((c) => c.status === "active");
  const payOf = (cid) => payments.find((p) => p.client_id === cid && p.month === month);
  const mrr = active.reduce((s, c) => s + (Number(c.fee) || 0), 0);

  const monthPays = active.map((c) => {
    const p = payOf(c.id);
    return { client: c, amount: p ? Number(p.amount) : Number(c.fee) || 0, status: p ? p.status : "pending" };
  });
  const collected = monthPays.filter((x) => x.status === "paid").reduce((s, x) => s + x.amount, 0);
  const pending = monthPays.filter((x) => x.status !== "paid").reduce((s, x) => s + x.amount, 0);

  const bySource = {};
  active.forEach((c) => { const s = c.source || "Other"; bySource[s] = (bySource[s] || 0) + (Number(c.fee) || 0); });

  const months = (() => {
    const set = new Set([month]);
    const now = new Date();
    for (let i = 0; i < 6; i++) set.add(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    payments.forEach((p) => set.add(p.month));
    return [...set].sort().reverse();
  })();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
        <button style={btn("#fff", ink)} disabled={payments.length === 0} onClick={() => downloadCsv("payments.csv", paymentsCsv(payments, clients))}>
          <Download size={15} /> Export CSV
        </button>
        <select style={{ ...sel, flex: "none", minWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Revenue month">
          {months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginBottom: 16 }}>
        <RevCard icon={DollarSign} label="Monthly Recurring" val={money(mrr)} hint={`${active.length} active clients`} />
        <RevCard icon={Check} label={`Collected · ${ymLabel(month)}`} val={money(collected)} hint="marked paid" />
        <RevCard icon={Wallet} label={`Pending · ${ymLabel(month)}`} val={money(pending)} hint="not yet paid" />
      </div>

      <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontFamily: disp, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Revenue by source</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
          {Object.keys(bySource).length === 0 ? <span style={{ color: "#6b6580", fontWeight: 600 }}>No active revenue.</span> :
            Object.entries(bySource).map(([s, v]) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: s === "Fiverr" ? accent : ink, border: "2px solid " + ink }} />
                <div><div style={{ fontWeight: 800, fontSize: 14 }}>{s}</div><div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 700 }}>{money(v)}/mo</div></div>
              </div>
            ))}
        </div>
      </div>

      <Panel>
        <h2 style={{ padding: "16px 20px", fontFamily: disp, fontSize: 15, textTransform: "uppercase", borderBottom: BD }}>Payments · {ymLabel(month)}</h2>
        {active.length === 0 ? <Empty>No active clients.</Empty> : monthPays.map(({ client, amount, status }) => (
          <div key={client.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "2px solid #f0ece2" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{client.name}</div>
              <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600 }}>{client.source} · {money(client.fee)}/mo</div>
            </div>
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
  );
}
