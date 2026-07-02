import React from "react";
import { FolderKanban, CheckSquare, ClipboardList, DollarSign, Search, AlertTriangle } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt } from "../lib/theme";
import { money, ym, isPastDue } from "../lib/format";
import { typeLabel, deliverableStatusLabel } from "../lib/constants";
import { Panel, Empty, RevCard } from "./ui";
import { keywordSummary } from "./Keywords";
import { scopeRows } from "../lib/scope";

const overdueDeliverable = (d) => isPastDue(d.due_date) && d.status !== "delivered";
const overdueTask = (t) => isPastDue(t.due) && (t.status || "todo") !== "done";

export default function Overview({ clients, tasks, deliverables, payments, keywords, retainers = [] }) {
  const nameOf = (id) => clients.find((c) => c.id === id)?.name || "—";

  const activeClients = clients.filter((c) => c.status === "active");
  const openTasks = tasks.filter((t) => (t.status || "todo") !== "done").length;
  const deliveredCount = deliverables.filter((d) => d.status === "delivered").length;

  const month = ym(new Date());
  const mrr = activeClients.reduce((s, c) => s + (Number(c.fee) || 0), 0);
  const collected = payments
    .filter((p) => p.month === month && p.status === "paid")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const ks = keywordSummary(keywords);

  const dueDeliverables = deliverables.filter(overdueDeliverable);
  const dueTasks = tasks.filter(overdueTask);
  // Scope creep: any client over their retainer scope this month.
  const scopeCreep = clients.flatMap((c) =>
    scopeRows(retainers, deliverables, c.id, month)
      .filter((r) => r.state === "over")
      .map((r) => ({ ...r, client: c.name }))
  );
  const attention = [
    ...dueDeliverables.map((d) => ({ id: `d-${d.id}`, kind: "Deliverable", title: d.title || typeLabel(d.type), client: nameOf(d.client_id), tag: deliverableStatusLabel(d.status), note: `Due ${d.due_date}`, sortKey: String(d.due_date) })),
    ...dueTasks.map((t) => ({ id: `t-${t.id}`, kind: "Task", title: t.title, client: nameOf(t.client_id), tag: typeLabel(t.type), note: `Due ${t.due}`, sortKey: String(t.due) })),
    ...scopeCreep.map((r) => ({ id: `s-${r.id}`, kind: "Scope", title: `Over scope: ${typeLabel(r.type)}`, client: r.client, tag: `${r.delivered}/${r.included}`, note: `Over +${r.delta}`, sortKey: "~" })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16, marginBottom: 18 }}>
        <RevCard icon={FolderKanban} label="Clients" val={String(clients.length)} hint={`${activeClients.length} active`} />
        <RevCard icon={CheckSquare} label="Open tasks" val={String(openTasks)} hint={`${tasks.length} total`} />
        <RevCard icon={ClipboardList} label="Deliverables" val={`${deliveredCount}/${deliverables.length}`} hint={`${dueDeliverables.length} overdue`} />
        <RevCard icon={DollarSign} label="Monthly recurring" val={money(mrr)} hint={`${money(collected)} collected this month`} />
        <RevCard icon={Search} label="Avg keyword rank" val={ks.avg == null ? "—" : `#${ks.avg}`} hint={`${ks.top10} in top 10`} />
      </div>

      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px", borderBottom: BD, fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>
          <AlertTriangle size={16} /> Needs attention
          {attention.length > 0 && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, background: "#f7dede", color: "#c0392b", border: BDt, borderRadius: 20, padding: "2px 11px" }}>{attention.length} flagged</span>}
        </div>
        {attention.length === 0 ? (
          <Empty>All caught up — nothing overdue or over scope. 🎉</Empty>
        ) : (
          attention.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderBottom: "2px solid #f0ece2", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: BDt, textTransform: "uppercase", background: tint, minWidth: 90, textAlign: "center" }}>{a.kind}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "#6b6580", fontWeight: 600 }}>{a.client} · {a.tag}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#c0392b" }}>{a.note}</span>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
