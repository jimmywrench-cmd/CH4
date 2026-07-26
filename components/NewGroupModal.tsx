"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/client/AuthContext";
import RoleBadge from "./RoleBadge";

export default function NewGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (groupId: number) => void;
}) {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/leaderboard?tab=newest")
      .then((r) => r.json())
      .then((d) => setAllUsers((d.users ?? []).filter((u: any) => u.id !== user?.id)));
  }, [user?.id]);

  const filtered = allUsers.filter((u) =>
    u.username.toLowerCase().includes(search.trim().toLowerCase())
  );

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (selected.size === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_ids: Array.from(selected), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.group.id);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-title" style={{ fontSize: 14 }}>
          <span className="accent-bar" />
          New Group
        </div>

        <input
          type="text"
          placeholder="Group name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <input
          type="text"
          placeholder="Search people…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 10 }}
        />

        <div className="member-pick-list">
          {filtered.map((u) => {
            const isSelected = selected.has(u.id);
            return (
              <button
                type="button"
                className={`member-pick-row${isSelected ? " selected" : ""}`}
                key={u.id}
                onClick={() => toggle(u.id)}
              >
                <span className={`member-pick-check${isSelected ? " checked" : ""}`}>
                  {isSelected && "✓"}
                </span>
                <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                  {u.username.slice(0, 2).toUpperCase()}
                </div>
                <span className="small">{u.username}</span>
                <RoleBadge role={u.role} />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty-state small">No matching users.</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={create}
            disabled={selected.size === 0 || creating}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {creating ? "Creating…" : `Start Group${selected.size ? ` (${selected.size + 1})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
