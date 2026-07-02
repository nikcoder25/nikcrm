import React from "react";
import { FolderKanban, CheckSquare, ClipboardList, DollarSign, Search, AlertTriangle, Clock } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt } from "../lib/theme";
import { money, ym, isPastDue, timeAgo, todayStr } from "../lib/format";
import { typeLabel, deliverableStatusLabel, STATUSES, STATUS_LABEL, activityLabel } from "../lib/constants";
import { Panel, Empty, RevCard } from "./ui";
import { keywordSummary } from "./Keywords";
import { activityIcon } from "./Activity";
import { scopeRows } from "../lib/scope";

// Distinct swatch per client status for the breakdown bar.
const STATUS_COLOR = { lead: "#f0b429", upcoming: "#8b5cf6", active: "#6d28d9", paused: "#94a3b8", ended: "#64748b", loss: "#c0392b" };

const overdueDeliverable = (d) => isPastDue(d.due_date) && d.status !== "delivered";
const overdueTask = (t) => isPastDue(t.due) && (t.status || "todo") !== "done";

export default function Overview({ clients, tasks, deliverables, payments, keywords, retainers = [], activities = [], onNavigate, onOpenClient }) {
  const clientOf = (id) => clients.find((c) => c.id === id);
  const nameOf = (id) => clientOf(id)?.name || "—";
  const go = (tab) => onNavigate && onNavigate(tab);

  const activeClients = clients.filter((c) => c.status === "active");
  const openTasks = tasks.filter((t) => (t.status || "todo") !== "done").length;
  const deliveredCount = deliverables.filter((d) => d.status === "delivered").length;

  const month = ym(new Date());
  const today10 = todayStr();
  const now = new Date();
  const nextMonth = ym(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const mrr = activeClients.reduce((s, c) => s + (Number(c.fee) || 0), 0);
  const collected = payments
    .filter((p) => p.month === month && p.status === "paid")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const ks = keywordSummary(keywords);

  // Client status breakdown for the segmented bar (only statuses in play).
  const statusCounts = STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], count: clients.filter((c) => c.status === s).length })).filter((s) => s.count > 0);
  const totalClients = clients.length || 1;

  // Most recent client touchpoints across the whole book (already sorted desc
  // by the API, but re-sort defensively) for the activity feed.
  const recentActivity = [...activities]
    .sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at)))
    .slice(0, 8);

  // Follow-ups that are due today or overdue — a client owed a next touch.
  const dueFollowups = activities.filter((a) => a.follow_up_date && String(a.follow_up_date).slice(0, 10) <= today10);

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
    ...dueFollowups.map((a) => ({ id: `f-${a.id}`, kind: "Follow-up", title: a.body, client: nameOf(a.client_id), clientId: a.client_id, tag: activityLabel(a.type), note: isPastDue(a.follow_up_date) ? "Overdue" : "Due today", sortKey: `0-${a.follow_up_date}` })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const KIND_TAB = { Deliverable: "deliverables", Blocked: "deliverables", Task: "tasks", Payment: "revenue", Renewal: "clients", Scope: "clients" };
  // Route an attention row: follow-ups open the client page; everything else
  // jumps to the relevant tab.
  const openAttention = (a) => {
    if (a.clientId && onOpenClient) { const c = clientOf(a.clientId); if (c) { onOpenClient(c); return; } }
    go(KIND_TAB[a.kind] || "overview");
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16, marginBottom: 18 }}>
        <RevCard icon={FolderKanban} label="Clients" val={String(clients.length)} hint={`${activeClients.length} active`} onClick={() => go("clients")} />
        <RevCard icon={CheckSquare} label="Open tasks" val={String(openTasks)} hint={`${tasks.length} total`} onClick={() => go("tasks")} />
        <RevCard icon={ClipboardList} label="Deliverables" val={`${deliveredCount}/${deliverables.length}`} hint={`${dueDeliverables.length} overdue`} onClick={() => go("deliverables")} />
        <RevCard icon={DollarSign} label="Monthly recurring" val={money(mrr)} hint={`${money(collected)} collected this month`} onClick={() => go("revenue")} />
        <RevCard icon={Search} label="Avg keyword rank" val={ks.avg == null ? "—" : `#${ks.avg}`} hint={`${ks.top10} in top 10`} onClick={() => go("keywords")} />
      </div>

      {/* Client status breakdown */}
      {statusCounts.length > 0 && (
        <Panel>
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <FolderKanban size={16} />
              <h2 style={{ fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>Client book</h2>
              <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#6b6580" }}>{clients.length} total</span>
            </div>
            <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", border: BDt }}>
              {statusCounts.map((s) => (
                <div key={s.key} title={`${s.label}: ${s.count}`} style={{ width: `${(s.count / totalClients) * 100}%`, background: STATUS_COLOR[s.key] || accent }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
              {statusCounts.map((s) => (
                <button key={s.key} onClick={() => go("clients")}
                  style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", font: "inherit", color: ink, padding: 0 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, border: BDt, background: STATUS_COLOR[s.key] || accent }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{s.label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 900, fontFamily: disp }}>{s.count}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, marginTop: 16, alignItems: "start" }}>
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
              <button key={a.id} onClick={() => openAttention(a)}
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

        <Panel>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px", borderBottom: BD }}>
            <Clock size={16} />
            <h2 style={{ fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>Recent activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <Empty>No client activity logged yet. Open a client to log a call, email, or note.</Empty>
          ) : (
            recentActivity.map((a) => {
              const client = clientOf(a.client_id);
              const I = activityIcon(a.type);
              const open = () => client && onOpenClient && onOpenClient(client);
              return (
                <button key={a.id} onClick={open}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 20px", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "2px solid #f0ece2", cursor: client ? "pointer" : "default", font: "inherit", color: "inherit" }}>
                  <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, background: tint, border: BDt, display: "flex", alignItems: "center", justifyContent: "center", color: accent }}><I size={15} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>
                      {nameOf(a.client_id)} <span style={{ color: "#6b6580", fontWeight: 700 }}>· {activityLabel(a.type)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#4b4560", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.body}</div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#6b6580", flexShrink: 0 }}>{timeAgo(a.happened_at)}</span>
                </button>
              );
            })
          )}
        </Panel>
      </div>
    </div>
  );
}
