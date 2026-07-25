"use client";

import { useEffect, useState } from "react";
import { Rank, rankForLevel, displayRankName } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";

export default function SearchView({ query, ranks }: { query: string; ranks: Rank[] }) {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/leaderboard?tab=level")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? users.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          rankForLevel(ranks, u.level).name.toLowerCase().includes(q) ||
          `level ${u.level}`.includes(q) ||
          (u.level_label && u.level_label.toLowerCase().includes(q))
      )
    : [];

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Search Results
      </div>
      <div className="card" style={{ padding: 8 }}>
        {results.length === 0 ? (
          <div className="empty-state small">No matches for &quot;{query}&quot;</div>
        ) : (
          results.map((u) => (
            <div className="lb-row" key={u.id}>
              <div className="avatar">{u.username.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.username}</div>
                <div className="muted small">
                  {u.level_label ? u.level_label : `Level ${u.level} · ${displayRankName(ranks, u)}`}
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
