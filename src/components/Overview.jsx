import React from "react";
import { FolderKanban, CheckSquare, ClipboardList, DollarSign, Search, AlertTriangle, History } from "lucide-react";
import { tint, disp, BD, BDt } from "../lib/theme";
import { money, ym, isPastDue } from "../lib/format";
import { typeLabel, deliverableStatusLabel } from "../lib/constants";
import { Panel, Empty, RevCard } from "./ui";
import { ActivityFeed } from "./Activity";
import { keywordSummary } from "./Keywords";
import { scopeRows } from "../lib/scope";

const overdueDeliverable = (d) => isPastDue(d.due_date) && d.status !== "delivered";
const overdueTask = (t) => isPastDue(t.due) && (t.status || "todo") !== "done";

export default function Overview({ clients, tasks, deliverables, payments, keywords, retainers = [], activity = [], onNavigate }) {
  const nameOf = (id) => clients.find((c) => c.id === id)?.name || "—";
  const go = (tab) => onNavigate && onNavigate(tab);

  const activeClients = clients.filter((c) => c.status === "active");
  const openTasks = tasks.filter((t) => (t.status || "todo") !== "done").length;
  const deliveredCount = deliverables.filter((d) => d.status === "delivered").length;

  const month = ym(new Date());
  const now = new Date();
  const nextMonth = ym(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const mrr = activeClients.reduce((s, c) => s + (Number(c.fee) || 0), 0);
  const collected = payments
    .filter((p) => p.month === month && p.status === "paid")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const ks = keywordSummary(keywords);

  const dueDeliverables = deliverables.filter(overdueDeliverable);
  const dueTasks = tasks.filter(overdueTask);
  const blocked = deliverables.filter((d) => d.status === "blocked");
  // A payment needs attention when it's explicitly overdue, or still pending for
  // a month that has already passed.
  const duePayments = payments.filter((p) => p.status === "overdue" || (p.status === "pending" && p.month < month));
  // Renewals landing this month or next, for still-active clients.
  const renewals = activeClients.filter((c) => c.renewal_month && (c.renewal_month === month || c.renewal_month === nextMonth));
  // Scope creep: any client over their retainer scope this month.
  const scopeCreep = clients.flatMap((c) =>
    scopeRows(retainers, deliverables, c.id, month)
      .filter((r) => r.state === "over")
      .map((r) => ({ ...r, client: c.name }))
  );

  const attention = [
    ...dueDeliverables.map((d) => ({ id: `d-${d.id}`, kind: "Deliverable", title: d.title || typeLabel(d.type), client: nameOf(d.client_id), tag: deliverableStatusLabel(d.status), note: `Due ${d.due_date}`, sortKey: `1-${d.due_date}` })),
    ...dueTasks.map((t) => ({ id: `t-${t.id}`, kind: "Task", title: t.title, client: nameOf(t.client_id), tag: typeLabel(t.type), note: `Due ${t.due}`, sortKey: `1-${t.due}` })),
    ...duePayments.map((p) => ({ id: `p-${p.id}`, kind: "Payment", title: `${money(p.amount)} ${p.status === "overdue" ? "overdue" : "unpaid"}`, client: nameOf(p.client_id), tag: p.month, note: p.status === "overdue" ? "Overdue" : "Past due", sortKey: `0-${p.month}` })),
    ...blocked.map((d) => ({ id: `b-${d.id}`, kind: "Blocked", title: d.title || typeLabel(d.type), client: nameOf(d.client_id), tag: "Blocked", note: "Needs unblocking", sortKey: "2-" })),
    ...renewals.map((c) => ({ id: `r-${c.id}`, kind: "Renewal", title: `${c.name} renews`, client: c.name, tag: c.renewal_month === month ? "This month" : "Next month", note: `Renews ${c.renewal_month}`, sortKey: `3-${c.renewal_month}` })),
    ...scopeCreep.map((r) => ({ id: `s-${r.id}`, kind: "Scope", title: `Over scope: ${typeLabel(r.type)}`, client: r.client, tag: `${r.delivered}/${r.included}`, note: `Over +${r.delta}`, sortKey: "4-" })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const KIND_TAB = { Deliverable: "deliverables", Blocked: "deliverables", Task: "tasks", Payment: "revenue", Renewal: "clients", Scope: "clients" };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16, marginBottom: 18 }}>
        <RevCard icon={FolderKanban} label="Clients" val={String(clients.length)} hint={`${activeClients.length} active`} onClick={() => go("clients")} />
        <RevCard icon={CheckSquare} label="Open tasks" val={String(openTasks)} hint={`${tasks.length} total`} onClick={() => go("tasks")} />
        <RevCard icon={ClipboardList} label="Deliverables" val={`${deliveredCount}/${deliverables.length}`} hint={`${dueDeliverables.length} overdue`} onClick={() => go("deliverables")} />
        <RevCard icon={DollarSign} label="Monthly recurring" val={money(mrr)} hint={`${money(collected)} collected this month`} onClick={() => go("revenue")} />
        <RevCard icon={Search} label="Avg keyword rank" val={ks.avg == null ? "—" : `#${ks.avg}`} hint={`${ks.top10} in top 10`} onClick={() => go("keywords")} />
      </div>

      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px", borderBottom: BD }}>
          <AlertTriangle size={16} />
          <h2 style={{ fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>Needs attention</h2>
          {attention.length > 0 && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, background: "#f7dede", color: "#c0392b", border: BDt, borderRadius: 20, padding: "2px 11px" }}>{attention.length} flagged</span>}
        </div>
        {attention.length === 0 ? (
          <Empty>All caught up — nothing overdue, blocked, renewing, or over scope. 🎉</Empty>
        ) : (
          attention.map((a) => (
            <button key={a.id} onClick={() => go(KIND_TAB[a.kind] || "overview")}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", flexWrap: "wrap", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "2px solid #f0ece2", cursor: "pointer", font: "inherit", color: "inherit" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: BDt, textTransform: "uppercase", background: tint, minWidth: 90, textAlign: "center" }}>{a.kind}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "#6b6580", fontWeight: 600 }}>{a.client} · {a.tag}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#c0392b" }}>{a.note}</span>
            </button>
          ))
        )}
      </Panel>

      <div style={{ marginTop: 18 }}>
        <Panel>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px", borderBottom: BD, fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>
            <History size={16} /> Recent activity
          </div>
          <ActivityFeed items={activity.slice(0, 8)} clients={clients} />
        </Panel>
      </div>
    </div>
  );
}
