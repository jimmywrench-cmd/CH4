"use client";

import { useEffect, useState } from "react";
import { useAuth, isAdmin, isOwnerOrCoOwner } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import { Rank, rankForLevel, rankBounds, displayRankName } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";
import StatusPermissionsView from "./StatusPermissionsView";
import CustomRoleBadge, { CustomRole } from "../CustomRoleBadge";
import CustomRoleManager from "../CustomRoleManager";

type DashTab = "review" | "users" | "analytics" | "announce" | "ranks" | "permissions";

const ROLE_CYCLE = ["Member", "Verified", "Helper", "Moderator", "Admin", "Co-Owner", "Owner"];
const roleLabel = (r: string) => r;

export default function DashboardView({
  ranks,
  reloadRanks,
}: {
  ranks: Rank[];
  reloadRanks: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const admin = user ? isAdmin(user.role) : false;
  const ownerOrCoOwner = user ? isOwnerOrCoOwner(user.role) : false;
  const [tab, setTab] = useState<DashTab>("review");

  const [queue, setQueue] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [showRoleManager, setShowRoleManager] = useState(false);
  const [assignPickerFor, setAssignPickerFor] = useState<string | null>(null);
  const [createRoleFor, setCreateRoleFor] = useState<string | null>(null);

  async function loadQueue() {
    const res = await fetch("/api/submissions?status=pending");
    const data = await res.json();
    setQueue(data.submissions ?? []);
  }
  async function loadUsers() {
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(data.users ?? []);
  }
  async function loadCustomRoles() {
    const res = await fetch("/api/custom-roles");
    const data = await res.json();
    setCustomRoles(data.roles ?? []);
  }

  useEffect(() => {
    loadQueue();
    loadUsers();
    loadCustomRoles();
  }, []);

  async function assignRole(userId: string, roleId: string) {
    const res = await fetch(`/api/users/${userId}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: roleId }),
    });
    if (!res.ok) return toast((await res.json()).error || "Could not assign role.");
    setAssignPickerFor(null);
    loadUsers();
  }
  async function unassignRole(userId: string, roleId: string) {
    const res = await fetch(`/api/users/${userId}/roles/${roleId}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not remove role.");
    loadUsers();
  }

  const tabs: DashTab[] = admin
    ? [
        "review",
        "users",
        "analytics",
        "announce",
        "ranks",
        ...(ownerOrCoOwner ? (["permissions"] as DashTab[]) : []),
      ]
    : ["review", "users", "analytics"];

  async function approve(id: number) {
    const res = await fetch(`/api/submissions/${id}/approve`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Could not approve.");
    toast("Approved — user leveled up.");
    loadQueue();
    loadUsers();
  }
  async function reject(id: number) {
    const res = await fetch(`/api/submissions/${id}/reject`, { method: "POST" });
    if (!res.ok) return toast("Could not reject.");
    toast("Rejected.");
    loadQueue();
    loadUsers();
  }
  async function deleteSub(id: number) {
    const res = await fetch(`/api/submissions/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not delete.");
    toast("Submission deleted.");
    loadQueue();
  }

  async function setLevel(u: any, value: string) {
    const raw = value.trim();
    const current = u.level_label ?? String(u.level);
    if (!raw || raw === current) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: raw }),
    });
    if (!res.ok) return toast((await res.json()).error || "Could not update.");
    toast(`${u.username} is now "${raw}"`);
    loadUsers();
  }
  async function cycleRole(u: any) {
    const next = ROLE_CYCLE[(ROLE_CYCLE.indexOf(u.role) + 1) % ROLE_CYCLE.length];
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Could not update role.");
    toast(`${u.username} is now ${roleLabel(next)}`);
    loadUsers();
  }
  async function toggleSuspend(u: any) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: !u.suspended }),
    });
    if (!res.ok) return toast("Could not update.");
    toast(`${u.username} ${u.suspended ? "unsuspended" : "suspended"}.`);
    loadUsers();
  }
  async function toggleBan(u: any) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banned: !u.banned }),
    });
    if (!res.ok) return toast("Could not update ban status.");
    toast(`${u.username} has been ${u.banned ? "unbanned" : "banned"}.`);
    loadUsers();
  }
  async function deleteUser(u: any) {
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Could not delete.");
    toast(`${u.username} deleted.`);
    loadUsers();
  }

  async function postAnnouncement() {
    if (!annTitle.trim() || !annBody.trim()) return toast("Add a title and message first.");
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: annTitle.trim(), body: annBody.trim() }),
    });
    if (!res.ok) return toast("Could not post.");
    setAnnTitle("");
    setAnnBody("");
    toast("Announcement posted.");
  }

  async function editRankMin(id: string, value: string) {
    const v = parseInt(value);
    if (isNaN(v)) return;
    const res = await fetch(`/api/ranks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ min_level: v }),
    });
    if (!res.ok) return toast("Could not update rank.");
    reloadRanks();
  }
  async function editRankName(id: string, value: string, current: string) {
    const v = value.trim();
    if (!v || v === current) return;
    const res = await fetch(`/api/ranks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: v }),
    });
    if (!res.ok) return toast("Could not rename rank.");
    toast(`Rank renamed to "${v}"`);
    reloadRanks();
  }
  async function editRankMax(id: string, value: string) {
    const v = value.trim();
    const payload = v === "" || v === "∞" ? { max_level: null } : { max_level: parseInt(v, 10) };
    if (payload.max_level !== null && !Number.isFinite(payload.max_level)) return;
    const res = await fetch(`/api/ranks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return toast((await res.json()).error || "Could not update max level.");
    reloadRanks();
  }
  async function addRank() {
    const last = bounds[bounds.length - 1];
    const newMin = last ? (last.max_level === Infinity ? last.min_level + 2 : last.max_level + 1) : 1;
    const res = await fetch("/api/ranks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `New Rank ${bounds.length + 1}`, min_level: newMin }),
    });
    if (!res.ok) return toast("Could not add rank.");
    toast("New rank tier added — rename it below.");
    reloadRanks();
  }
  async function removeRank(id: string) {
    const res = await fetch(`/api/ranks/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Could not remove rank.");
    toast("Rank tier removed.");
    reloadRanks();
  }

  const bounds = rankBounds(ranks);
  const totalApproved = users.reduce((s, u) => s + (u.approved_count || 0), 0);
  const totalRejected = users.reduce((s, u) => s + (u.rejected_count || 0), 0);
  const pct = totalApproved + totalRejected > 0 ? (totalApproved / (totalApproved + totalRejected)) * 100 : 0;
  const newUsers7d = users.filter(
    (u) => Date.now() - new Date(u.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;

  const circumference = 2 * Math.PI * 36;

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        {admin ? "Owner Dashboard" : "Mod Dashboard"}
      </div>

      <div className="grid3 mb18">
        <div className="card kpi">
          <div className="kpi-num">{queue.length}</div>
          <div className="kpi-lbl">Pending Reviews</div>
        </div>
        <div className="card kpi">
          <div className="kpi-num">{pct.toFixed(0)}%</div>
          <div className="kpi-lbl">Approval Rate</div>
        </div>
        <div className="card kpi">
          <div className="kpi-num">{newUsers7d}</div>
          <div className="kpi-lbl">New Users (7d)</div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={`tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {
              {
                review: "Pending Reviews",
                users: "Manage Users",
                analytics: "Analytics",
                announce: "Announcements",
                ranks: "Rank Requirements",
                permissions: "Status Permissions",
              }[t]
            }
          </button>
        ))}
      </div>

      {tab === "review" && (
        <div>
          {queue.length === 0 ? (
            <div className="card muted" style={{ padding: 30, textAlign: "center" }}>
              Queue is empty — nice work.
            </div>
          ) : (
            queue.map((s) => (
              <div className="card review-card" key={s.id}>
                <div className="review-top">
                  <div>
                    <div className="flex gap8 mb10" style={{ flexWrap: "wrap" }}>
                      <b>@{s.username}</b>
                      <span className="pill">Lvl {s.current_level}</span>
                      <span className="pill">{rankForLevel(ranks, s.current_level).name}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                    <div className="muted small" style={{ marginTop: 4, maxWidth: 480, whiteSpace: "pre-wrap" }}>
                      {s.description}
                    </div>
                  </div>
                  <span className="muted small">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
                {s.video_url ? (
                  <video
                    src={s.video_url}
                    controls
                    preload="metadata"
                    style={{
                      width: "100%",
                      maxHeight: 320,
                      borderRadius: 12,
                      background: "#000",
                      display: "block",
                    }}
                  />
                ) : (
                  <div className="review-thumb">No clip attached.</div>
                )}
                <div className="flex gap10">
                  <button className="btn btn-success btn-sm" onClick={() => approve(s.id)}>
                    ✅ Approve
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => reject(s.id)}>
                    ❌ Reject
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => deleteSub(s.id)}>
                    🗑 Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "users" && (
        <div>
          {admin && (
            <div className="flex gap8 mb18" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowRoleManager(true)}>
                + Create Custom Role
              </button>
            </div>
          )}
          <div className="card" style={{ padding: "6px 10px" }}>
          <table>
            <tbody>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Level</th>
                <th>Rank</th>
                <th>Roles</th>
                <th>Approved</th>
                {admin && <th>Actions</th>}
              </tr>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="flex gap10">
                    <div className="avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                    {u.username}
                    {u.suspended && (
                      <span className="pill" style={{ color: "var(--yellow)", marginLeft: 6 }}>
                        Suspended
                      </span>
                    )}
                    {u.banned && (
                      <span className="pill" style={{ color: "var(--red)", marginLeft: 6 }}>
                        Banned
                      </span>
                    )}
                  </td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="mono">
                    {admin ? (
                      <input
                        type="text"
                        defaultValue={u.level_label ?? u.level}
                        className="mono"
                        style={{
                          width: 72,
                          background: "rgba(255,255,255,.05)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "5px 8px",
                          color: "var(--text)",
                        }}
                        onBlur={(e) => setLevel(u, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    ) : (
                      u.level_label ?? u.level
                    )}
                  </td>
                  <td>{displayRankName(ranks, u)}</td>
                  <td style={{ position: "relative", minWidth: 140 }}>
                    <div className="flex gap8" style={{ flexWrap: "wrap", alignItems: "center" }}>
                      {(u.custom_roles ?? []).map((r: CustomRole) => (
                        <CustomRoleBadge
                          key={r.id}
                          role={r}
                          size="sm"
                          onRemove={admin ? () => unassignRole(u.id, r.id) : undefined}
                        />
                      ))}
                      {admin && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "1px 7px" }}
                          onClick={() =>
                            setAssignPickerFor(assignPickerFor === u.id ? null : u.id)
                          }
                        >
                          +
                        </button>
                      )}
                    </div>
                    {assignPickerFor === u.id && (
                      <div
                        className="card"
                        style={{
                          position: "absolute",
                          zIndex: 20,
                          top: "100%",
                          left: 0,
                          marginTop: 4,
                          padding: 8,
                          minWidth: 160,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {customRoles
                          .filter((r) => !(u.custom_roles ?? []).some((ur: CustomRole) => ur.id === r.id))
                          .map((r) => (
                            <button
                              key={r.id}
                              className="btn btn-ghost btn-sm"
                              style={{ justifyContent: "flex-start" }}
                              onClick={() => assignRole(u.id, r.id)}
                            >
                              <CustomRoleBadge role={r} size="sm" />
                            </button>
                          ))}
                        {customRoles.length === 0 && (
                          <span className="muted small">No custom roles yet.</span>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ justifyContent: "flex-start", borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 2 }}
                          onClick={() => {
                            setAssignPickerFor(null);
                            setCreateRoleFor(u.id);
                            setShowRoleManager(true);
                          }}
                        >
                          + Custom Role
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="mono">{u.approved_count}</td>
                  {admin && (
                    <td>
                      <div className="flex gap8" style={{ flexWrap: "wrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => cycleRole(u)}>
                          Status
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleSuspend(u)}>
                          {u.suspended ? "Unsuspend" : "Suspend"}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => toggleBan(u)}>
                          {u.banned ? "Unban" : "Ban"}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showRoleManager && (
        <CustomRoleManager
          roles={customRoles}
          startInCreate={!!createRoleFor}
          onClose={() => {
            setShowRoleManager(false);
            if (createRoleFor) {
              setAssignPickerFor(createRoleFor);
              setCreateRoleFor(null);
            }
          }}
          onChanged={() => {
            loadCustomRoles();
            loadUsers();
          }}
        />
      )}

      {tab === "analytics" && (
        <div className="grid2">
          <div className="card" style={{ padding: 20 }}>
            <div className="section-title" style={{ fontSize: 13 }}>
              <span className="accent-bar" />
              Community Totals
            </div>
            <p className="small muted" style={{ marginTop: 10, lineHeight: 1.8 }}>
              {users.length} members · {totalApproved} approved clips · {totalRejected} rejected
              clips
            </p>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="section-title" style={{ fontSize: 13 }}>
              <span className="accent-bar" />
              Approved vs Rejected
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 10 }}>
              <svg width={90} height={90} viewBox="0 0 90 90">
                <circle cx={45} cy={45} r={36} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={12} />
                <circle
                  cx={45}
                  cy={45}
                  r={36}
                  fill="none"
                  stroke="var(--green)"
                  strokeWidth={12}
                  strokeDasharray={`${(circumference * pct) / 100} ${circumference}`}
                  transform="rotate(-90 45 45)"
                />
              </svg>
              <div>
                <div className="flex gap8 mb10">
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--green)" }} />
                  <span className="small">
                    Approved — <b>{totalApproved}</b>
                  </span>
                </div>
                <div className="flex gap8">
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--red)" }} />
                  <span className="small">
                    Rejected — <b>{totalRejected}</b>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "announce" && admin && (
        <div className="card" style={{ padding: 20, maxWidth: 560 }}>
          <div className="field">
            <label>Announcement Title</label>
            <input
              type="text"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="e.g. Season 3 kicks off"
            />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              placeholder="Write your announcement…"
            />
          </div>
          <button className="btn btn-primary" onClick={postAnnouncement}>
            Post Announcement
          </button>
        </div>
      )}

      {tab === "ranks" && admin && (
        <div>
          <div className="card" style={{ padding: "6px 10px", maxWidth: 640 }}>
            <table>
              <tbody>
                <tr>
                  <th>Rank</th>
                  <th>Min Level</th>
                  <th>Max Level</th>
                  <th></th>
                </tr>
                {bounds.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      <input
                        type="text"
                        defaultValue={r.name}
                        style={{
                          width: 140,
                          background: "rgba(255,255,255,.05)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "5px 8px",
                          color: "var(--text)",
                          fontWeight: 600,
                        }}
                        onBlur={(e) => editRankName(r.id, e.target.value, r.name)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        defaultValue={r.min_level}
                        className="mono"
                        style={{
                          width: 60,
                          background: "rgba(255,255,255,.05)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "5px 8px",
                          color: "var(--text)",
                        }}
                        onBlur={(e) => editRankMin(r.id, e.target.value)}
                      />
                    </td>
                    <td className="mono muted">
                      {i === bounds.length - 1 ? (
                        <input
                          type="text"
                          defaultValue={r.max_level === Infinity ? "" : r.max_level}
                          placeholder="∞"
                          className="mono"
                          style={{
                            width: 60,
                            background: "rgba(255,255,255,.05)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            padding: "5px 8px",
                            color: "var(--text)",
                          }}
                          onBlur={(e) => editRankMax(r.id, e.target.value)}
                        />
                      ) : r.max_level === Infinity ? (
                        "∞"
                      ) : (
                        r.max_level
                      )}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeRank(r.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={addRank}>
            + Create New Rank
          </button>
        </div>
      )}

      {tab === "permissions" && ownerOrCoOwner && <StatusPermissionsView />}
    </div>
  );
}
