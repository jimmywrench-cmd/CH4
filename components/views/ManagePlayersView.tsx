"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth, isOwner, isOwnerOrCoOwner } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import { Rank, rankForLevel, rankBounds, displayRankName, nextLevelInfo } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";
import CustomRoleBadge, { CustomRole } from "../CustomRoleBadge";
import CustomRoleManager from "../CustomRoleManager";

type PlayerUser = {
  id: string;
  username: string;
  role: string;
  level: number;
  level_label: string | null;
  approved_count: number;
  rejected_count: number;
  suspended: boolean;
  banned: boolean;
  created_at: string;
  last_seen: string;
  custom_roles: CustomRole[];
};

const ROLE_OPTIONS = ["Member", "Verified", "Helper", "Moderator", "Admin", "Co-Owner", "Owner"];
const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const PAGE_SIZES = [25, 50, 100];

type SortKey = "username" | "level" | "rank" | "approved" | "join" | "lastActive";

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function ManagePlayersView({ ranks }: { ranks: Rank[] }) {
  const { user: me, can } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<PlayerUser[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // toolbar state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rankFilter, setRankFilter] = useState("all");
  const [customRoleFilter, setCustomRoleFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState("all"); // all | suspended | banned | active
  const [sortKey, setSortKey] = useState<SortKey>("join");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  // selection + pagination
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // row popovers / menus

  // modals
  const [showRoleManager, setShowRoleManager] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<PlayerUser | null>(null);
  const [levelModalUser, setLevelModalUser] = useState<PlayerUser | null>(null);
  const [statusModalUser, setStatusModalUser] = useState<PlayerUser | null>(null);
  const [videosModalUser, setVideosModalUser] = useState<PlayerUser | null>(null);
  const [profileModalUser, setProfileModalUser] = useState<PlayerUser | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    | { kind: "delete"; user: PlayerUser }
    | { kind: "ban"; user: PlayerUser }
    | { kind: "bulk-delete"; ids: string[] }
    | { kind: "bulk-ban"; ids: string[] }
    | null
  >(null);

  const anyModalOpen =
    showRoleManager ||
    !!roleModalUser ||
    !!levelModalUser ||
    !!statusModalUser ||
    !!videosModalUser ||
    !!profileModalUser ||
    !!confirmAction;

  async function loadUsers(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      if (!silent) setLoading(false);
    }
  }
  async function loadCustomRoles() {
    const res = await fetch("/api/custom-roles");
    const data = await res.json();
    setCustomRoles(data.roles ?? []);
  }
  async function loadPending() {
    const res = await fetch("/api/submissions?status=pending");
    const data = await res.json();
    setPendingCount((data.submissions ?? []).length);
  }

  useEffect(() => {
    loadUsers();
    loadCustomRoles();
    loadPending();
  }, []);

  // Lightweight polling so staff see each other's changes without a refresh —
  // paused while a modal is open so it can't yank data out from under an edit.
  useEffect(() => {
    const id = setInterval(() => {
      if (!anyModalOpen) {
        loadUsers(true);
        loadPending();
      }
    }, 15000);
    return () => clearInterval(id);
  }, [anyModalOpen]);

  function refreshUser(id: string, patch: Partial<PlayerUser>) {
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  // ---------- derived stats (whole roster, not just filtered) ----------
  const stats = useMemo(() => {
    const total = users.length;
    const online = users.filter((u) => Date.now() - new Date(u.last_seen).getTime() < ONLINE_WINDOW_MS).length;
    const banned = users.filter((u) => u.banned).length;
    const suspended = users.filter((u) => u.suspended).length;
    const totalApproved = users.reduce((s, u) => s + (u.approved_count || 0), 0);
    return { total, online, banned, suspended, totalApproved };
  }, [users]);

  const rankNames = useMemo(() => rankBounds(ranks).map((r) => r.name), [ranks]);

  // ---------- filtering ----------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.username.toLowerCase().includes(q) && !u.id.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && u.role !== statusFilter) return false;
      if (rankFilter !== "all") {
        if (rankFilter === "__custom__") {
          if (!(u.level_label && u.level_label.trim())) return false;
        } else if (displayRankName(ranks, u) !== rankFilter) {
          return false;
        }
      }
      if (customRoleFilter !== "all") {
        if (!(u.custom_roles ?? []).some((r) => r.id === customRoleFilter)) return false;
      }
      if (flagFilter === "suspended" && !u.suspended) return false;
      if (flagFilter === "banned" && !u.banned) return false;
      if (flagFilter === "active" && (u.suspended || u.banned)) return false;
      return true;
    });
  }, [users, search, statusFilter, rankFilter, customRoleFilter, flagFilter, ranks]);

  // ---------- sorting ----------
  const sorted = useMemo(() => {
    const bounds = rankBounds(ranks);
    const rankIndex = (u: PlayerUser) => {
      if (u.level_label && u.level_label.trim()) return -1;
      const idx = bounds.findIndex((r) => u.level >= r.min_level && u.level <= r.max_level);
      return idx === -1 ? bounds.length : idx;
    };
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "username":
          cmp = a.username.localeCompare(b.username);
          break;
        case "level":
          cmp = a.level - b.level;
          break;
        case "rank":
          cmp = rankIndex(a) - rankIndex(b);
          break;
        case "approved":
          cmp = (a.approved_count || 0) - (b.approved_count || 0);
          break;
        case "join":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "lastActive":
          cmp = new Date(a.last_seen).getTime() - new Date(b.last_seen).getTime();
          break;
      }
      return cmp * sortDir;
    });
    return list;
  }, [filtered, sortKey, sortDir, ranks]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const paginated = sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, rankFilter, customRoleFilter, flagFilter, pageSize]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === "username" ? 1 : -1);
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="mp-sort-arrow">{sortDir === 1 ? "▲" : "▼"}</span>;
  }

  // ---------- selection ----------
  const pageIds = paginated.map((u) => u.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setSelected((s) => {
      const next = new Set(s);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }
  const selectedUsers = users.filter((u) => selected.has(u.id));

  // ---------- single-user actions ----------
  async function patchUser(id: string, body: any): Promise<boolean> {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "Could not update user.");
      return false;
    }
    return true;
  }

  async function toggleSuspend(u: PlayerUser) {
    const ok = await patchUser(u.id, { suspended: !u.suspended });
    if (ok) {
      refreshUser(u.id, { suspended: !u.suspended });
      toast(`${u.username} ${u.suspended ? "unsuspended" : "suspended"}.`);
    }
  }
  async function toggleBanDirect(u: PlayerUser) {
    const ok = await patchUser(u.id, { banned: !u.banned });
    if (ok) {
      refreshUser(u.id, { banned: !u.banned });
      toast(`${u.username} has been ${u.banned ? "unbanned" : "banned"}.`);
    }
  }
  async function doDelete(u: PlayerUser) {
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || "Could not delete user.");
    toast(`${u.username} deleted.`);
    setUsers((list) => list.filter((x) => x.id !== u.id));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(u.id);
      return next;
    });
  }
  async function sendMessage(u: PlayerUser) {
    const res = await fetch("/api/dms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_ids: [u.id] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || "Could not start conversation.");
    toast(`DM started with @${u.username} — find it in Chat.`);
  }

  // ---------- bulk actions ----------
  async function bulkSuspend(suspended: boolean) {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => patchUser(id, { suspended })));
    setUsers((list) => list.map((u) => (selected.has(u.id) ? { ...u, suspended } : u)));
    toast(`${suspended ? "Suspended" : "Unsuspended"} ${ids.length} user${ids.length === 1 ? "" : "s"}.`);
  }
  async function bulkBan(banned: boolean) {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => patchUser(id, { banned })));
    setUsers((list) => list.map((u) => (selected.has(u.id) ? { ...u, banned } : u)));
    toast(`${banned ? "Banned" : "Unbanned"} ${ids.length} user${ids.length === 1 ? "" : "s"}.`);
    setConfirmAction(null);
  }
  async function bulkDelete() {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => fetch(`/api/users/${id}`, { method: "DELETE" })));
    setUsers((list) => list.filter((u) => !selected.has(u.id)));
    setSelected(new Set());
    toast(`Deleted ${ids.length} user${ids.length === 1 ? "" : "s"}.`);
    setConfirmAction(null);
  }
  async function bulkChangeStatus(role: string) {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => patchUser(id, { role })));
    setUsers((list) => list.map((u) => (selected.has(u.id) ? { ...u, role } : u)));
    toast(`Set ${ids.length} user${ids.length === 1 ? "" : "s"} to ${role}.`);
  }
  async function bulkAssignRole(roleId: string, assign: boolean) {
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((id) =>
        assign
          ? fetch(`/api/users/${id}/roles`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role_id: roleId }),
            })
          : fetch(`/api/users/${id}/roles/${roleId}`, { method: "DELETE" })
      )
    );
    toast(`${assign ? "Assigned" : "Removed"} role for ${ids.length} user${ids.length === 1 ? "" : "s"}.`);
    loadUsers(true);
  }
  function exportSelected() {
    const rows = selectedUsers.length ? selectedUsers : paginated;
    const header = ["id", "username", "status", "level", "rank", "approved_videos", "suspended", "banned", "joined"];
    const lines = rows.map((u) =>
      [
        u.id,
        u.username,
        u.role,
        u.level_label ?? u.level,
        displayRankName(ranks, u),
        u.approved_count,
        u.suspended,
        u.banned,
        u.created_at,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ch4-players-export.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} user${rows.length === 1 ? "" : "s"}.`);
  }

  return (
    <div>
      {/* ---------- stat cards ---------- */}
      <div className="mp-stats">
        <div className="card mp-stat">
          <div className="mp-stat-icon">👥</div>
          <div className="mp-stat-num">{stats.total}</div>
          <div className="mp-stat-lbl">Total Users</div>
        </div>
        <div className="card mp-stat">
          <div className="mp-stat-icon">🟢</div>
          <div className="mp-stat-num">{stats.online}</div>
          <div className="mp-stat-lbl">Online Now</div>
        </div>
        <div className="card mp-stat">
          <div className="mp-stat-icon">🚫</div>
          <div className="mp-stat-num">{stats.banned}</div>
          <div className="mp-stat-lbl">Banned</div>
        </div>
        <div className="card mp-stat">
          <div className="mp-stat-icon">⏸</div>
          <div className="mp-stat-num">{stats.suspended}</div>
          <div className="mp-stat-lbl">Suspended</div>
        </div>
        <div className="card mp-stat">
          <div className="mp-stat-icon">🎬</div>
          <div className="mp-stat-num">{pendingCount}</div>
          <div className="mp-stat-lbl">Pending Videos</div>
        </div>
        <div className="card mp-stat">
          <div className="mp-stat-icon">✅</div>
          <div className="mp-stat-num">{stats.totalApproved}</div>
          <div className="mp-stat-lbl">Approved Videos</div>
        </div>
      </div>

      {can("create_custom_roles") && (
        <div className="flex gap8 mb14" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRoleManager(true)}>
            + Create Custom Role
          </button>
        </div>
      )}

      {/* ---------- toolbar ---------- */}
      <div className="card mp-toolbar">
        <div className="mp-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx={11} cy={11} r={7} />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search by username or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select className="mp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select className="mp-select" value={rankFilter} onChange={(e) => setRankFilter(e.target.value)}>
          <option value="all">All Ranks</option>
          {rankNames.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value="__custom__">Custom Level</option>
        </select>

        <select
          className="mp-select"
          value={customRoleFilter}
          onChange={(e) => setCustomRoleFilter(e.target.value)}
        >
          <option value="all">All Custom Roles</option>
          {customRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select className="mp-select" value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)}>
          <option value="all">Active + Flagged</option>
          <option value="active">Active Only</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>

        <div className="mp-toolbar-divider" />

        <select
          className="mp-select"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="username">Sort: Username</option>
          <option value="level">Sort: Level</option>
          <option value="rank">Sort: Rank</option>
          <option value="approved">Sort: Approved Videos</option>
          <option value="join">Sort: Join Date</option>
          <option value="lastActive">Sort: Last Active</option>
        </select>
        <button
          className="mp-page-btn"
          title={sortDir === 1 ? "Ascending" : "Descending"}
          onClick={() => setSortDir((d) => (d === 1 ? -1 : 1))}
        >
          {sortDir === 1 ? "▲" : "▼"}
        </button>
      </div>

      {/* ---------- bulk action bar ---------- */}
      {selected.size > 0 && (
        <div className="card mp-bulkbar">
          <span className="mp-bulkbar-count">{selected.size} selected</span>
          {can("suspend_users") && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => bulkSuspend(true)}>
                Suspend
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => bulkSuspend(false)}>
                Unsuspend
              </button>
            </>
          )}
          {can("ban_users") && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmAction({ kind: "bulk-ban", ids: Array.from(selected) })}
            >
              Ban
            </button>
          )}
          {can("unban_users") && (
            <button className="btn btn-ghost btn-sm" onClick={() => bulkBan(false)}>
              Unban
            </button>
          )}
          {can("change_user_statuses") && (
            <select
              className="mp-select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) bulkChangeStatus(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Change Status…
              </option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          {can("assign_custom_roles") && customRoles.length > 0 && (
            <>
              <select
                className="mp-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) bulkAssignRole(e.target.value, true);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Assign Role…
                </option>
                {customRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                className="mp-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) bulkAssignRole(e.target.value, false);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Remove Role…
                </option>
                {customRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={exportSelected}>
            Export Selected
          </button>
          {can("delete_users") && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmAction({ kind: "bulk-delete", ids: Array.from(selected) })}
            >
              Delete
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* ---------- table ---------- */}
      <div className="card" style={{ padding: 0 }}>
        <div className="mp-table-scroll">
          <table className="mp-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <Checkbox checked={allPageSelected} indeterminate={!allPageSelected && somePageSelected} onClick={togglePage} />
                </th>
                <th className="sortable" onClick={() => toggleSort("username")}>
                  User {sortArrow("username")}
                </th>
                <th>Status</th>
                <th className="sortable" onClick={() => toggleSort("level")}>
                  Level {sortArrow("level")}
                </th>
                <th className="sortable" onClick={() => toggleSort("rank")}>
                  Rank {sortArrow("rank")}
                </th>
                <th>Roles</th>
                <th className="sortable" onClick={() => toggleSort("approved")}>
                  Approved {sortArrow("approved")}
                </th>
                <th className="sortable" onClick={() => toggleSort("lastActive")}>
                  Last Active {sortArrow("lastActive")}
                </th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <span className="spinner" /> Loading players…
                    </div>
                  </td>
                </tr>
              )}
              {!loading && paginated.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">No players match these filters.</div>
                  </td>
                </tr>
              )}
              {!loading &&
                paginated.map((u, i) => {
                  const online = Date.now() - new Date(u.last_seen).getTime() < ONLINE_WINDOW_MS;
                  const { levelsInRank, posInRank } = nextLevelInfo(ranks, u.level);
                  const pct = levelsInRank ? Math.min(100, (posInRank / levelsInRank) * 100) : 100;
                  const visibleRoles = (u.custom_roles ?? []).slice(0, 2);
                  const extraRoles = (u.custom_roles ?? []).length - visibleRoles.length;

                  return (
                    <tr
                      key={u.id}
                      className={selected.has(u.id) ? "selected" : ""}
                      style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}
                    >
                      <td>
                        <Checkbox checked={selected.has(u.id)} onClick={() => toggleOne(u.id)} />
                      </td>
                      <td>
                        <div className="mp-user-cell">
                          <div className="mp-avatar-wrap">
                            <div className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>
                              {initials(u.username)}
                            </div>
                            <span className={`mp-online-dot${online ? " online" : ""}`} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="mp-user-name">
                              {u.username}
                              {u.suspended && <span className="mp-flag-pill mp-flag-suspended">Suspended</span>}
                              {u.banned && <span className="mp-flag-pill mp-flag-banned">Banned</span>}
                            </div>
                            <div className="mp-user-id">#{u.id.slice(0, 8)}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="mp-level-cell">
                        <div className="mp-level-top">
                          <span className="mp-level-num mono">{u.level_label ?? u.level}</span>
                        </div>
                        <div className="mp-xp-track">
                          <div className="mp-xp-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td>{displayRankName(ranks, u)}</td>
                      <td>
                        <div className="mp-roles-cell">
                          {visibleRoles.map((r) => (
                            <CustomRoleBadge key={r.id} role={r} size="sm" />
                          ))}
                          {extraRoles > 0 && <span className="mp-roles-more">+{extraRoles}</span>}
                          {can("assign_custom_roles") && (
                            <button className="mp-edit-roles-btn" onClick={() => setRoleModalUser(u)}>
                              Edit Roles
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <button className="mp-approved-btn" onClick={() => setVideosModalUser(u)}>
                          {u.approved_count}
                        </button>
                      </td>
                      <td className="small muted">{timeAgo(u.last_seen)}</td>
                      <td className="mp-actions-cell">
                        <RowMenu
                          user={u}
                          can={can}
                          onViewProfile={() => setProfileModalUser(u)}
                          onEditStatus={() => setStatusModalUser(u)}
                          onEditRoles={() => setRoleModalUser(u)}
                          onChangeLevel={() => setLevelModalUser(u)}
                          onSuspendToggle={() => toggleSuspend(u)}
                          onBanToggle={() => {
                            if (u.banned) toggleBanDirect(u);
                            else setConfirmAction({ kind: "ban", user: u });
                          }}
                          onViewVideos={() => setVideosModalUser(u)}
                          onSendMessage={() => sendMessage(u)}
                          onDelete={() => setConfirmAction({ kind: "delete", user: u })}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- pagination ---------- */}
      <div className="mp-pagination">
        <div className="flex gap8">
          <span className="small muted">Rows per page</span>
          <select className="mp-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="small muted">
            {sorted.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1}–
            {Math.min(clampedPage * pageSize, sorted.length)} of {sorted.length}
          </span>
        </div>
        <div className="flex gap8">
          <button className="mp-page-btn" disabled={clampedPage <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹
          </button>
          <span className="small">
            Page <b>{clampedPage}</b> / {totalPages}
          </span>
          <button
            className="mp-page-btn"
            disabled={clampedPage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
        </div>
      </div>

      {/* ---------- modals ---------- */}
      {showRoleManager && (
        <CustomRoleManager
          roles={customRoles}
          onClose={() => setShowRoleManager(false)}
          onChanged={() => {
            loadCustomRoles();
            loadUsers(true);
          }}
        />
      )}

      {roleModalUser && (
        <RoleEditModal
          user={roleModalUser}
          customRoles={customRoles}
          canAssign={can("assign_custom_roles")}
          canCreate={can("create_custom_roles")}
          onClose={() => setRoleModalUser(null)}
          onOpenRoleManager={() => {
            setRoleModalUser(null);
            setShowRoleManager(true);
          }}
          onAssign={async (roleId) => {
            const res = await fetch(`/api/users/${roleModalUser.id}/roles`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role_id: roleId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return toast(data.error || "Could not assign role.");
            await loadUsers(true);
            setRoleModalUser((cur) =>
              cur ? { ...cur, custom_roles: [...cur.custom_roles, customRoles.find((r) => r.id === roleId)!] } : cur
            );
          }}
          onRemove={async (roleId) => {
            const res = await fetch(`/api/users/${roleModalUser.id}/roles/${roleId}`, { method: "DELETE" });
            if (!res.ok) return toast("Could not remove role.");
            await loadUsers(true);
            setRoleModalUser((cur) =>
              cur ? { ...cur, custom_roles: cur.custom_roles.filter((r) => r.id !== roleId) } : cur
            );
          }}
        />
      )}

      {levelModalUser && (
        <LevelEditModal
          user={levelModalUser}
          ranks={ranks}
          canEdit={can("change_user_levels")}
          onClose={() => setLevelModalUser(null)}
          onSave={async (value) => {
            const ok = await patchUser(levelModalUser.id, { level: value });
            if (ok) {
              toast(`${levelModalUser.username}'s level updated.`);
              await loadUsers(true);
              setLevelModalUser(null);
            }
          }}
        />
      )}

      {statusModalUser && (
        <StatusEditModal
          user={statusModalUser}
          canGrantOwner={me ? isOwner(me.role) : false}
          canGrantCoOwner={me ? isOwnerOrCoOwner(me.role) : false}
          canEdit={can("change_user_statuses")}
          onClose={() => setStatusModalUser(null)}
          onSave={async (role) => {
            const ok = await patchUser(statusModalUser.id, { role });
            if (ok) {
              toast(`${statusModalUser.username} is now ${role}.`);
              refreshUser(statusModalUser.id, { role });
              setStatusModalUser(null);
            }
          }}
        />
      )}

      {videosModalUser && (
        <VideosModal
          user={videosModalUser}
          canRemove={can("deny_videos")}
          onClose={() => setVideosModalUser(null)}
          onRemoved={() => loadUsers(true)}
        />
      )}

      {profileModalUser && (
        <ProfilePreviewModal user={profileModalUser} ranks={ranks} onClose={() => setProfileModalUser(null)} />
      )}

      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          onClose={() => setConfirmAction(null)}
          onConfirmDelete={doDelete}
          onConfirmBan={() => toggleBanDirect((confirmAction as any).user)}
          onConfirmBulkDelete={bulkDelete}
          onConfirmBulkBan={() => bulkBan(true)}
        />
      )}
    </div>
  );
}

// ================================================================
// Small subcomponents
// ================================================================

function Checkbox({
  checked,
  indeterminate,
  onClick,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className={`mp-checkbox${checked ? " checked" : ""}${indeterminate ? " indeterminate" : ""}`}
      onClick={onClick}
      aria-label="Select"
      type="button"
    >
      {checked && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}

function RowMenu({
  user,
  can,
  onViewProfile,
  onEditStatus,
  onEditRoles,
  onChangeLevel,
  onSuspendToggle,
  onBanToggle,
  onViewVideos,
  onSendMessage,
  onDelete,
}: {
  user: PlayerUser;
  can: (p: string) => boolean;
  onViewProfile: () => void;
  onEditStatus: () => void;
  onEditRoles: () => void;
  onChangeLevel: () => void;
  onSuspendToggle: () => void;
  onBanToggle: () => void;
  onViewVideos: () => void;
  onSendMessage: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      // Flip to open above the button if there isn't room below.
      const menuHeight = 380;
      const top =
        rect.bottom + menuHeight > window.innerHeight
          ? Math.max(8, rect.top - menuHeight)
          : rect.bottom + 6;
      setPos({ top, left: Math.max(8, rect.right - 208) });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    window.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function fire(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <>
      <button ref={btnRef} className={`mp-kebab${open ? " open" : ""}`} onClick={openMenu}>
        ⋮
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="popover mp-menu"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="mp-menu-item" onClick={() => fire(onViewProfile)}>
              👤 View Profile
            </button>
            <button
              className="mp-menu-item"
              onClick={() => fire(onChangeLevel)}
              disabled={!can("change_user_levels")}
            >
              📈 Change Level
            </button>
            <button
              className="mp-menu-item"
              onClick={() => fire(onEditStatus)}
              disabled={!can("change_user_statuses")}
            >
              🎖 Edit Status
            </button>
            <button
              className="mp-menu-item"
              onClick={() => fire(onEditRoles)}
              disabled={!can("assign_custom_roles")}
            >
              🏷 Edit Roles
            </button>
            <div className="mp-menu-sep" />
            <button
              className="mp-menu-item"
              onClick={() => fire(onSuspendToggle)}
              disabled={!can("suspend_users")}
            >
              {user.suspended ? "▶ Unsuspend" : "⏸ Suspend"}
            </button>
            <button
              className="mp-menu-item danger"
              onClick={() => fire(onBanToggle)}
              disabled={user.banned ? !can("unban_users") : !can("ban_users")}
            >
              {user.banned ? "✅ Unban" : "🚫 Ban"}
            </button>
            <div className="mp-menu-sep" />
            <button className="mp-menu-item" onClick={() => fire(onViewVideos)}>
              🎬 View Submitted Videos
            </button>
            <button className="mp-menu-item" onClick={() => fire(onSendMessage)}>
              💬 Send Message
            </button>
            <button className="mp-menu-item" disabled title="Not available yet">
              🔑 Reset Password
            </button>
            <div className="mp-menu-sep" />
            <button className="mp-menu-item danger" onClick={() => fire(onDelete)} disabled={!can("delete_users")}>
              🗑 Delete User
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function RoleEditModal({
  user,
  customRoles,
  canAssign,
  canCreate,
  onClose,
  onAssign,
  onRemove,
  onOpenRoleManager,
}: {
  user: PlayerUser;
  customRoles: CustomRole[];
  canAssign: boolean;
  canCreate: boolean;
  onClose: () => void;
  onAssign: (roleId: string) => void;
  onRemove: (roleId: string) => void;
  onOpenRoleManager: () => void;
}) {
  const [q, setQ] = useState("");
  const assignedIds = new Set(user.custom_roles.map((r) => r.id));
  const visible = customRoles.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="section-title" style={{ fontSize: 14 }}>
          <span className="accent-bar" />
          Edit Roles — {user.username}
        </div>

        {user.custom_roles.length > 0 && (
          <div className="mp-roles-cell mb14" style={{ maxWidth: "none" }}>
            {user.custom_roles.map((r) => (
              <CustomRoleBadge key={r.id} role={r} onRemove={canAssign ? () => onRemove(r.id) : undefined} />
            ))}
          </div>
        )}

        <div className="field">
          <label>Search Roles</label>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
          {visible.length === 0 && <div className="muted small">No roles match.</div>}
          {visible.map((r) => (
            <div key={r.id} className="mp-role-pick-row">
              <CustomRoleBadge role={r} size="sm" />
              {assignedIds.has(r.id) ? (
                <button className="btn btn-ghost btn-sm" onClick={() => onRemove(r.id)} disabled={!canAssign}>
                  Remove
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => onAssign(r.id)} disabled={!canAssign}>
                  Add
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap8">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
          {canCreate && (
            <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={onOpenRoleManager}>
              Create / Edit Roles
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LevelEditModal({
  user,
  ranks,
  canEdit,
  onClose,
  onSave,
}: {
  user: PlayerUser;
  ranks: Rank[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(String(user.level_label ?? user.level));
  const bounds = rankBounds(ranks);
  const currentRank = rankForLevel(ranks, user.level);
  const currentIdx = bounds.findIndex((r) => r.id === currentRank.id);
  const nextRank = bounds[currentIdx + 1];
  const prevRank = bounds[currentIdx - 1];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="section-title" style={{ fontSize: 14 }}>
          <span className="accent-bar" />
          Change Level — {user.username}
        </div>

        <div className="mb14">
          <div className="mp-hover-row">
            <span>Current rank</span>
            <b>{displayRankName(ranks, user)}</b>
          </div>
        </div>

        <div className="field">
          <label>Level (number, or a custom label)</label>
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} />
        </div>

        <div className="flex gap8 mb14" style={{ flexWrap: "wrap" }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!canEdit}
            onClick={() => setValue(String(Math.max(1, (parseInt(value, 10) || user.level) - 1)))}
          >
            − 1 Level
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!canEdit}
            onClick={() => setValue(String((parseInt(value, 10) || user.level) + 1))}
          >
            + 1 Level
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!canEdit || !prevRank}
            onClick={() => prevRank && setValue(String(prevRank.min_level))}
          >
            ⬇ Demote to {prevRank ? prevRank.name : "—"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!canEdit || !nextRank}
            onClick={() => nextRank && setValue(String(nextRank.min_level))}
          >
            ⬆ Promote to {nextRank ? nextRank.name : "—"}
          </button>
        </div>

        <div className="flex gap8">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            style={{ flex: 1, justifyContent: "center" }}
            disabled={!canEdit || !value.trim()}
            onClick={() => onSave(value)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusEditModal({
  user,
  canGrantOwner,
  canGrantCoOwner,
  canEdit,
  onClose,
  onSave,
}: {
  user: PlayerUser;
  canGrantOwner: boolean;
  canGrantCoOwner: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSave: (role: string) => void;
}) {
  const options = ROLE_OPTIONS.filter((r) => {
    if (r === "Owner") return canGrantOwner;
    if (r === "Co-Owner") return canGrantCoOwner;
    return true;
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="section-title" style={{ fontSize: 14 }}>
          <span className="accent-bar" />
          Edit Status — {user.username}
        </div>
        <div className="mb14">
          Current: <RoleBadge role={user.role} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {options.map((r) => (
            <button
              key={r}
              className="btn btn-ghost btn-sm"
              style={{ justifyContent: "space-between" }}
              disabled={!canEdit || r === user.role}
              onClick={() => onSave(r)}
            >
              <RoleBadge role={r} />
              {r === user.role && <span className="muted small">current</span>}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function VideosModal({
  user,
  canRemove,
  onClose,
  onRemoved,
}: {
  user: PlayerUser;
  canRemove: boolean;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"approved" | "all">("approved");
  const [subs, setSubs] = useState<any[] | null>(null);

  useEffect(() => {
    setSubs(null);
    const url =
      tab === "approved"
        ? `/api/submissions?user_id=${user.id}&status=approved`
        : `/api/submissions?user_id=${user.id}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setSubs(d.submissions ?? []));
  }, [tab, user.id]);

  async function remove(id: number) {
    if (!window.confirm("Remove this submission? This can't be undone.")) return;
    const res = await fetch(`/api/submissions/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not remove submission.");
    setSubs((s) => (s ? s.filter((x) => x.id !== id) : s));
    onRemoved();
    toast("Submission removed.");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, maxHeight: "80vh", overflowY: "auto" }}>
        <div className="section-title" style={{ fontSize: 14 }}>
          <span className="accent-bar" />
          Videos — {user.username}
        </div>
        <div className="chat-subtabs">
          <button
            className={`chat-subtab${tab === "approved" ? " active" : ""}`}
            onClick={() => setTab("approved")}
          >
            Approved ({user.approved_count})
          </button>
          <button className={`chat-subtab${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>
            All Submissions
          </button>
        </div>

        {subs === null && (
          <div className="empty-state">
            <span className="spinner" /> Loading…
          </div>
        )}
        {subs && subs.length === 0 && <div className="empty-state">Nothing here yet.</div>}
        {subs &&
          subs.map((s) => (
            <div key={s.id} className="mp-video-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mp-video-title">{s.title}</div>
                <div className="mp-video-date">
                  {new Date(s.created_at).toLocaleDateString()} · {s.status}
                </div>
              </div>
              {s.video_url && (
                <a className="btn btn-ghost btn-sm" href={s.video_url} target="_blank" rel="noreferrer">
                  View
                </a>
              )}
              {canRemove && (
                <button className="btn btn-danger btn-sm" onClick={() => remove(s.id)}>
                  Remove
                </button>
              )}
            </div>
          ))}

        <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function ProfilePreviewModal({ user, ranks, onClose }: { user: PlayerUser; ranks: Rank[]; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="flex gap12 mb18">
          <div className="avatar" style={{ width: 48, height: 48, fontSize: 15 }}>
            {initials(user.username)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{user.username}</div>
            <div className="flex gap8" style={{ marginTop: 4 }}>
              <RoleBadge role={user.role} />
              {user.suspended && <span className="mp-flag-pill mp-flag-suspended">Suspended</span>}
              {user.banned && <span className="mp-flag-pill mp-flag-banned">Banned</span>}
            </div>
          </div>
        </div>
        <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div className="card stat-box">
            <div className="stat-num">{user.level_label ?? user.level}</div>
            <div className="stat-lbl">Level</div>
          </div>
          <div className="card stat-box">
            <div className="stat-num">{user.approved_count}</div>
            <div className="stat-lbl">Approved</div>
          </div>
        </div>
        <div className="mp-hover-row">
          <span>Rank</span>
          <b>{displayRankName(ranks, user)}</b>
        </div>
        <div className="mp-hover-row">
          <span>Custom roles</span>
          <b>{user.custom_roles.length ? user.custom_roles.map((r) => r.name).join(", ") : "None"}</b>
        </div>
        <div className="mp-hover-row">
          <span>Joined</span>
          <b>{new Date(user.created_at).toLocaleDateString()}</b>
        </div>
        <div className="mp-hover-row">
          <span>Last active</span>
          <b>{timeAgo(user.last_seen)}</b>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({
  action,
  onClose,
  onConfirmDelete,
  onConfirmBan,
  onConfirmBulkDelete,
  onConfirmBulkBan,
}: {
  action:
    | { kind: "delete"; user: PlayerUser }
    | { kind: "ban"; user: PlayerUser }
    | { kind: "bulk-delete"; ids: string[] }
    | { kind: "bulk-ban"; ids: string[] };
  onClose: () => void;
  onConfirmDelete: (u: PlayerUser) => void;
  onConfirmBan: () => void;
  onConfirmBulkDelete: () => void;
  onConfirmBulkBan: () => void;
}) {
  const [typed, setTyped] = useState("");
  const isDelete = action.kind === "delete" || action.kind === "bulk-delete";
  const requiredText = action.kind === "delete" ? action.user.username : action.kind === "bulk-delete" ? "DELETE" : null;
  const canConfirm = requiredText === null || typed.trim() === requiredText;

  function confirm() {
    if (action.kind === "delete") onConfirmDelete(action.user);
    else if (action.kind === "bulk-delete") onConfirmBulkDelete();
    else if (action.kind === "ban") onConfirmBan();
    else if (action.kind === "bulk-ban") onConfirmBulkBan();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="section-title" style={{ fontSize: 14 }}>
          <span className="accent-bar" />
          {isDelete ? "Delete" : "Ban"} {"ids" in action ? `${action.ids.length} Users` : "User"}
        </div>

        <div className="mp-modal-danger-box">
          {action.kind === "delete" && (
            <>
              This permanently deletes <b>@{action.user.username}</b>&apos;s account — profile, submissions, roles,
              and chat history. This can&apos;t be undone.
            </>
          )}
          {action.kind === "bulk-delete" && (
            <>
              This permanently deletes <b>{action.ids.length}</b> accounts and everything attached to them. This
              can&apos;t be undone.
            </>
          )}
          {action.kind === "ban" && (
            <>
              <b>@{action.user.username}</b> will lose access immediately and won&apos;t be able to sign back in
              until unbanned.
            </>
          )}
          {action.kind === "bulk-ban" && (
            <>
              <b>{action.ids.length}</b> users will lose access immediately until unbanned.
            </>
          )}
        </div>

        {requiredText && (
          <div className="mp-type-confirm">
            <label className="small muted">
              Type <b className="mono">{requiredText}</b> to confirm
            </label>
            <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}

        <div className="flex gap8" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            style={{ flex: 1, justifyContent: "center" }}
            disabled={!canConfirm}
            onClick={confirm}
          >
            {isDelete ? "Delete Permanently" : "Ban"}
          </button>
        </div>
      </div>
    </div>
  );
}
