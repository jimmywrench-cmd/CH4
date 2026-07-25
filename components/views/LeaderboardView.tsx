"use client";

import { useEffect, useState } from "react";
import { Rank, rankForLevel, displayRankName } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";

const TABS: { key: string; label: string }[] = [
  { key: "level", label: "Highest Level" },
  { key: "approved", label: "Most Approved Videos" },
  { key: "active", label: "Most Active" },
  { key: "newest", label: "Newest Members" },
  { key: "contributors", label: "Top Contributors" },
];

export default function LeaderboardView({ ranks }: { ranks: Rank[] }) {
  const [tab, setTab] = useState("level");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?tab=${tab}`)
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Leaderboards
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 8 }}>
        {loading ? (
          <div className="empty-state small">Loading…</div>
        ) : users.length === 0 ? (
          <div className="empty-state small">No members yet.</div>
        ) : (
          users.map((u, i) => (
            <div className="lb-row" key={u.id}>
              <div className={`lb-rank-num${i === 0 ? " top" : ""}`}>{i + 1}</div>
              <div className="avatar">{u.username.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.username}</div>
                <div className="muted small">
                  {u.level_label ? u.level_label : `Level ${u.level} · ${displayRankName(ranks, u)}`} ·{" "}
                  {u.approved_count} approved
                </div>
              </div>
              <RoleBadge role={u.role} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
