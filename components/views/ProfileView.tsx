"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import { Rank, rankForLevel, nextLevelInfo } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";
import Insignia from "../Insignia";
import CustomRoleBadge, { CustomRole } from "../CustomRoleBadge";

export default function ProfileView({ ranks }: { ranks: Rank[] }) {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [activity, setActivity] = useState<any[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/submissions?mine=1`)
      .then((r) => r.json())
      .then((d) => setActivity(d.submissions ?? []));
    fetch(`/api/users/${user.id}/roles`)
      .then((r) => r.json())
      .then((d) => setCustomRoles(d.roles ?? []));
  }, [user?.id]);

  useEffect(() => {
    setBio(user?.bio ?? "");
    setUsername(user?.username ?? "");
  }, [user?.bio, user?.username]);

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
        body: JSON.stringify({ bio, username }),
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
              {!editing ? (
                <div className="profile-name">{user.username}</div>
              ) : (
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "4px 10px",
                    color: "var(--text)",
                    maxWidth: 200,
                  }}
                />
              )}
              <RoleBadge role={user.role} />
            </div>
            <div className="flex gap16 muted small mb14" style={{ flexWrap: "wrap" }}>
              {user.level_label ? (
                <span>{user.level_label}</span>
              ) : (
                <>
                  <span>Rank: {rank.name}</span>
                  <span>·</span>
                  <span>Level {user.level}</span>
                </>
              )}
              <span>·</span>
              <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            {customRoles.length > 0 && (
              <div className="flex gap8 mb14" style={{ flexWrap: "wrap", alignItems: "center" }}>
                <span className="muted small">Roles:</span>
                {customRoles.map((r) => (
                  <CustomRoleBadge key={r.id} role={r} />
                ))}
              </div>
            )}
            {!user.level_label && (
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
            )}
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
                  placeholder="Write a short bio…"
                />
                <div className="announce-char-count" style={{ textAlign: "right", marginTop: -4 }}>
                  {bio.length}/300
                </div>
              </div>
            )}
          </div>
          {!editing ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              Edit Profile
            </button>
          ) : (
            <div className="flex gap8">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditing(false);
                  setUsername(user.username);
                  setBio(user.bio ?? "");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={saveBio}
                disabled={saving || !username.trim()}
              >
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
