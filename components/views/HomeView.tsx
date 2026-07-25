"use client";

import { useEffect, useState } from "react";
import { Rank, rankForLevel } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";
import { ViewName } from "../AppShell";

export default function HomeView({
  ranks,
  go,
}: {
  ranks: Rank[];
  go: (v: ViewName) => void;
}) {
  const [users, setUsers] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [approved, setApproved] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [uRes, aRes, sRes] = await Promise.all([
        fetch("/api/leaderboard?tab=level"),
        fetch("/api/announcements"),
        fetch("/api/submissions?status=approved"),
      ]);
      const [uData, aData, sData] = await Promise.all([uRes.json(), aRes.json(), sRes.json()]);
      setUsers(uData.users ?? []);
      setAnnouncements(aData.announcements ?? []);
      setApproved((sData.submissions ?? []).slice(0, 5));
      setLoading(false);
    })();
  }, []);

  const totalApproved = users.reduce((s, u) => s + (u.approved_count || 0), 0);
  const onlineish = users.filter(
    (u) => Date.now() - new Date(u.last_seen).getTime() < 15 * 60 * 1000
  );

  return (
    <div>
      <div className="hero">
        <div className="hero-logo">CH4</div>
        <div className="hero-tag">Channel4 — Ops Network</div>
        <p className="hero-desc">
          A ranked community for clip submissions. Every approved video promotes you one level —
          climb from <b style={{ color: "#dadbee" }}>Spy</b> to{" "}
          <b style={{ color: "#dadbee" }}>Vanguard</b> and prove your run.
        </p>
        <div className="flex gap12">
          <button className="btn btn-primary" onClick={() => go("submit")}>
            Join the Queue
          </button>
          <button className="btn btn-ghost" onClick={() => go("leaderboard")}>
            View Leaderboard
          </button>
        </div>
        <div className="hero-stats">
          <div>
            <div className="hstat-num">{users.length}</div>
            <div className="hstat-lbl">Members</div>
          </div>
          <div>
            <div className="hstat-num">{totalApproved}</div>
            <div className="hstat-lbl">Approved Clips</div>
          </div>
          <div>
            <div className="hstat-num">{onlineish.length}</div>
            <div className="hstat-lbl">Active Recently</div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div>
          <div className="section-title">
            <span className="accent-bar" />
            Latest Announcements
          </div>
          <div className="card mb18" style={{ padding: 16 }}>
            {announcements.length === 0 ? (
              <div className="empty-state small">No announcements yet.</div>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="activity-item">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.title}</div>
                    <div className="muted small" style={{ marginTop: 2 }}>
                      {a.body}
                    </div>
                    <div className="muted small" style={{ marginTop: 4 }}>
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="section-title">
            <span className="accent-bar" />
            Recent Approved Submissions
          </div>
          <div className="card" style={{ padding: 8 }}>
            {approved.length === 0 ? (
              <div className="empty-state small">Nothing approved yet.</div>
            ) : (
              approved.map((s) => (
                <div className="lb-row" key={s.id}>
                  <div className="avatar">{s.username.slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.title}</div>
                    <div className="muted small">@{s.username}</div>
                  </div>
                  <span className="status-chip status-approved">Approved</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="section-title">
            <span className="accent-bar" />
            Top Ranked Members
          </div>
          <div className="card mb18" style={{ padding: 8 }}>
            {users.slice(0, 6).map((u, i) => (
              <div className="lb-row" key={u.id}>
                <div className={`lb-rank-num${i === 0 ? " top" : ""}`}>{i + 1}</div>
                <div className="avatar">{u.username.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.username}</div>
                  <div className="muted small">
                    Level {u.level} · {rankForLevel(ranks, u.level).name}
                  </div>
                </div>
                <RoleBadge role={u.role} />
              </div>
            ))}
          </div>

          <div className="section-title">
            <span className="accent-bar" />
            Recently Active
          </div>
          <div className="card" style={{ padding: 14 }}>
            {onlineish.slice(0, 8).map((u) => (
              <div className="online-item" key={u.id}>
                <span className="online-status" />
                <span className="small">{u.username}</span>
              </div>
            ))}
            {onlineish.length === 0 && (
              <div className="empty-state small">Nobody active recently.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
