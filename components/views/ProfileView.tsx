"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import { Rank, rankForLevel, nextLevelInfo } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";
import Insignia from "../Insignia";
import CustomRoleBadge, { CustomRole } from "../CustomRoleBadge";
import UploadShortModal from "../UploadShortModal";

type PublicProfile = {
  id: string;
  username: string;
  role: string;
  level: number;
  level_label: string | null;
  bio: string;
  avatar_seed: string;
  approved_count: number;
  rejected_count: number;
  created_at: string;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_self: boolean;
};

export default function ProfileView({
  ranks,
  viewedUserId,
  onVisit,
}: {
  ranks: Rank[];
  viewedUserId?: string | null;
  onVisit?: (userId: string) => void;
}) {
  const { user: me, refresh, can } = useAuth();
  const { toast } = useToast();
  const targetId = viewedUserId ?? me?.id ?? null;
  const isOwn = !!me && (!viewedUserId || viewedUserId === me.id);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<any[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [listModal, setListModal] = useState<null | "followers" | "following">(null);
  const [listUsers, setListUsers] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editFollowersOpen, setEditFollowersOpen] = useState(false);

  function reloadActivity() {
    if (!isOwn) return;
    fetch(`/api/submissions?mine=1`)
      .then((r) => r.json())
      .then((d) => setActivity(d.submissions ?? []));
  }

  useEffect(() => {
    if (!targetId) return;
    setLoading(true);
    fetch(`/api/users/${targetId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setProfile(d.user);
          setBio(d.user.bio ?? "");
          setUsername(d.user.username ?? "");
        }
      })
      .finally(() => setLoading(false));
    fetch(`/api/users/${targetId}/roles`)
      .then((r) => r.json())
      .then((d) => setCustomRoles(d.roles ?? []));
    reloadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, isOwn]);

  useEffect(() => {
    setEditing(false);
  }, [targetId]);

  if (!me || !targetId || !profile) {
    return loading ? <div className="empty-state small">Loading…</div> : null;
  }

  const rank = rankForLevel(ranks, profile.level);
  const { levelsInRank, posInRank } = nextLevelInfo(ranks, profile.level);
  const pct = levelsInRank ? Math.min(100, (posInRank / levelsInRank) * 100) : 100;
  const total = profile.approved_count + profile.rejected_count;
  const isMaxLevel = !levelsInRank && !profile.level_label;

  async function saveBio() {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${me!.id}`, {
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
      setProfile((p) => (p ? { ...p, bio, username } : p));
      setEditing(false);
      toast("Profile updated.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFollow() {
    if (!profile) return;
    setFollowBusy(true);
    try {
      const res = await fetch(`/api/users/${profile.id}/follow`, {
        method: profile.is_following ? "DELETE" : "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not update follow status.");
        return;
      }
      setProfile((p) =>
        p ? { ...p, is_following: data.following, follower_count: data.follower_count } : p
      );
    } finally {
      setFollowBusy(false);
    }
  }

  async function openList(kind: "followers" | "following") {
    if (!profile) return;
    setListModal(kind);
    setListLoading(true);
    try {
      const res = await fetch(`/api/users/${profile.id}/${kind}`);
      const data = await res.json();
      setListUsers(data.users ?? []);
    } finally {
      setListLoading(false);
    }
  }

  async function saveFollowerCount(n: number) {
    if (!profile) return false;
    const res = await fetch(`/api/users/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follower_count: Math.trunc(n) }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "Could not update follower count.");
      return false;
    }
    setProfile((p) => (p ? { ...p, follower_count: data.user.follower_count } : p));
    toast("Follower count updated.");
    return true;
  }

  return (
    <div>
      <div className={`card mb18${isMaxLevel ? " profile-hero-max" : ""}`}>
        <div className="profile-hero">
          <div className={isMaxLevel ? "insignia-prestige" : undefined}>
            <Insignia ranks={ranks} level={profile.level} size={72} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="profile-name-row mb10">
              {isOwn && editing ? (
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
              ) : (
                <div className="profile-name">{profile.username}</div>
              )}
              <RoleBadge role={profile.role} />
              {isMaxLevel && <span className="max-level-badge">👑 MAX LEVEL</span>}
            </div>
            <div className="flex gap16 muted small mb14" style={{ flexWrap: "wrap" }}>
              {profile.level_label ? (
                <span>{profile.level_label}</span>
              ) : (
                <>
                  <span>Rank: {rank.name}</span>
                  <span>·</span>
                  <span>Level {profile.level}</span>
                </>
              )}
              <span>·</span>
              <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex gap16 mb14" style={{ flexWrap: "wrap", alignItems: "center" }}>
              <button className="follow-stat" onClick={() => openList("followers")}>
                <b>{profile.follower_count}</b> <span className="muted">Followers</span>
              </button>
              {can("edit_follower_counts") && (
                <button
                  className="icon-btn"
                  title="Edit follower count"
                  onClick={() => setEditFollowersOpen(true)}
                  style={{ width: 26, height: 26 }}
                >
                  ✎
                </button>
              )}
              <button className="follow-stat" onClick={() => openList("following")}>
                <b>{profile.following_count}</b> <span className="muted">Following</span>
              </button>
            </div>
            {customRoles.length > 0 && (
              <div className="flex gap8 mb14" style={{ flexWrap: "wrap", alignItems: "center" }}>
                <span className="muted small">Roles:</span>
                {customRoles.map((r) => (
                  <CustomRoleBadge key={r.id} role={r} />
                ))}
              </div>
            )}
            {!profile.level_label && (
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
            {isOwn && editing ? (
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
            ) : (
              <p className="small muted" style={{ marginTop: 14, maxWidth: 480 }}>
                {profile.bio || "No bio yet."}
              </p>
            )}
          </div>
          {isOwn ? (
            !editing ? (
              <div className="flex gap8">
                <button className="btn btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                  Upload a Short
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                  Edit Profile
                </button>
              </div>
            ) : (
              <div className="flex gap8">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditing(false);
                    setUsername(profile.username);
                    setBio(profile.bio ?? "");
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
            )
          ) : (
            <button
              className={`btn btn-sm ${profile.is_following ? "btn-ghost" : "btn-primary"}`}
              onClick={toggleFollow}
              disabled={followBusy}
            >
              {followBusy ? (
                <span className="spinner" />
              ) : profile.is_following ? (
                "Following"
              ) : (
                "+ Follow"
              )}
            </button>
          )}
        </div>
      </div>

      <div className="grid3 mb18">
        <div className="card stat-box">
          <div className="stat-num">{profile.approved_count}</div>
          <div className="stat-lbl">Approved Videos</div>
        </div>
        <div className="card stat-box">
          <div className="stat-num">{profile.rejected_count}</div>
          <div className="stat-lbl">Rejected Videos</div>
        </div>
        <div className="card stat-box">
          <div className="stat-num">{total}</div>
          <div className="stat-lbl">Total Submissions</div>
        </div>
      </div>

      {isOwn && (
        <>
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
        </>
      )}

      {listModal && (
        <div className="modal-overlay" onClick={() => setListModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {listModal === "followers" ? "Followers" : "Following"}
            </div>
            <div className="modal-sub">@{profile.username}</div>
            {listLoading ? (
              <div className="empty-state small">Loading…</div>
            ) : listUsers.length === 0 ? (
              <div className="empty-state small">
                {listModal === "followers" ? "No followers yet." : "Not following anyone yet."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {listUsers.map((u) => (
                  <button
                    key={u.id}
                    className="lb-row"
                    style={{ width: "100%", background: "none", textAlign: "left" }}
                    onClick={() => {
                      setListModal(null);
                      onVisit?.(u.id);
                    }}
                  >
                    <div className="avatar">{u.username.slice(0, 2).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.username}</div>
                      <div className="muted small">
                        {u.level_label ? u.level_label : `Level ${u.level}`}
                      </div>
                    </div>
                    <RoleBadge role={u.role} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {uploadOpen && (
        <UploadShortModal onClose={() => setUploadOpen(false)} onUploaded={reloadActivity} />
      )}

      {editFollowersOpen && profile && (
        <EditFollowerCountModal
          username={profile.username}
          current={profile.follower_count}
          onClose={() => setEditFollowersOpen(false)}
          onSave={async (n) => {
            const ok = await saveFollowerCount(n);
            if (ok) setEditFollowersOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EditFollowerCountModal({
  username,
  current,
  onClose,
  onSave,
}: {
  username: string;
  current: number;
  onClose: () => void;
  onSave: (n: number) => void | Promise<void>;
}) {
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Follower count must be a non-negative number.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(n);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Edit Follower Count</div>
        <div className="modal-sub">@{username}</div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Followers</label>
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>

        {error && (
          <div className="small" style={{ color: "var(--red, #ff6b6b)", marginBottom: 8 }}>
            {error}
          </div>
        )}

        <div className="flex gap8" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
