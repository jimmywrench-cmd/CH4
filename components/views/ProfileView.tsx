"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import { Rank, rankForLevel, nextLevelInfo } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";
import Insignia from "../Insignia";

export default function ProfileView({ ranks }: { ranks: Rank[] }) {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [activity, setActivity] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/submissions?mine=1`)
      .then((r) => r.json())
      .then((d) => setActivity(d.submissions ?? []));
  }, [user?.id]);

  useEffect(() => {
    setBio(user?.bio ?? "");
  }, [user?.bio]);

  if (!user) return null;

  const rank = rankForLevel(ranks, user.level);
  const { levelsInRank, posInRank } = nextLevelInfo(ranks, user.level);
  const pct = levelsInRank ? Math.min(100, (posInRank / levelsInRank) * 100) : 100;
  const total = user.approved_count + user.rejected_count;

  async function saveBio() {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Could not save.");
        return;
      }
      await refresh();
      setEditing(false);
      toast("Profile updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="card mb18">
        <div className="profile-hero">
          <Insignia ranks={ranks} level={user.level} size={72} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="profile-name-row mb10">
              <div className="profile-name">{user.username}</div>
              <RoleBadge role={user.role} />
            </div>
            <div className="flex gap16 muted small mb14" style={{ flexWrap: "wrap" }}>
              <span>{rank.name}</span>
              <span>·</span>
              <span>Level {user.level}</span>
              <span>·</span>
              <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            <div style={{ maxWidth: 420 }}>
              <div className="flex" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                <span className="small muted">Progress to next level</span>
                <span className="small mono">
                  {levelsInRank ? `${posInRank}/${levelsInRank}` : "Max rank"}
                </span>
              </div>
              <div className="pbar-track">
                <div className="pbar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {!editing ? (
              <p className="small muted" style={{ marginTop: 14, maxWidth: 480 }}>
                {user.bio || "No bio yet."}
              </p>
            ) : (
              <div className="field" style={{ marginTop: 14, maxWidth: 480 }}>
                <textarea
                  value={bio}
                  maxLength={300}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
            )}
          </div>
          {!editing ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              Edit Profile
            </button>
          ) : (
            <div className="flex gap8">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveBio} disabled={saving}>
                {saving ? <span className="spinner" /> : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid3 mb18">
        <div className="card stat-box">
          <div className="stat-num">{user.approved_count}</div>
          <div className="stat-lbl">Approved Videos</div>
        </div>
        <div className="card stat-box">
          <div className="stat-num">{user.rejected_count}</div>
          <div className="stat-lbl">Rejected Videos</div>
        </div>
        <div className="card stat-box">
          <div className="stat-num">{total}</div>
          <div className="stat-lbl">Total Submissions</div>
        </div>
      </div>

      <div className="section-title">
        <span className="accent-bar" />
        Recent Activity
      </div>
      <div className="card" style={{ padding: "6px 16px" }}>
        {activity.length === 0 ? (
          <div className="empty-state small">No submissions yet.</div>
        ) : (
          activity.map((s) => (
            <div className="activity-item" key={s.id}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.title}</div>
                <div className="muted small">{new Date(s.created_at).toLocaleDateString()}</div>
              </div>
              <span className={`status-chip status-${s.status}`}>
                {s.status[0].toUpperCase() + s.status.slice(1)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
