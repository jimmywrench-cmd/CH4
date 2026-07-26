"use client";

import { useState } from "react";
import { useAuth, isStaff } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import RoleBadge from "../RoleBadge";
import { useAnnouncements, Announcement } from "@/lib/client/useAnnouncements";
import { playAnnouncementChime } from "@/lib/client/sound";

const TITLE_MAX = 80;
const BODY_MAX = 1000;

export default function AnnouncementsView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { announcements, reload } = useAnnouncements((a) => {
    playAnnouncementChime();
    toast(`📢 New announcement: ${a.title}`);
  });

  if (!user) return null;

  async function post() {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      toast("Title and message are required.");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, body: b }),
      });
      const data = await res.json();
      if (res.ok) {
        setTitle("");
        setBody("");
        reload();
        toast("Announcement posted.");
      } else {
        toast(data.error || "Could not post announcement.");
      }
    } finally {
      setPosting(false);
    }
  }

  async function deleteAnnouncement(id: number) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    if (res.ok) {
      reload();
      toast("Announcement deleted.");
    } else {
      const data = await res.json();
      toast(data.error || "Could not delete announcement.");
    }
  }

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Announcements
      </div>

      {isStaff(user.role) && (
        <div className="card announce-form">
          <div className="section-title" style={{ fontSize: 13 }}>
            <span className="accent-bar" />
            Post an Announcement
          </div>
          <input
            type="text"
            placeholder="Title"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="What's the announcement?"
            value={body}
            maxLength={BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="announce-form-foot">
            <span
              className={`announce-char-count${body.length > BODY_MAX * 0.9 ? " limit" : ""}`}
            >
              {body.length}/{BODY_MAX}
            </span>
            <div className="flex gap8">
              {(title || body) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setTitle("");
                    setBody("");
                  }}
                  disabled={posting}
                >
                  Clear
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={post}
                disabled={posting || !title.trim() || !body.trim()}
              >
                {posting ? "Posting…" : "Post Announcement"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="announce-wrap">
        {announcements.length === 0 ? (
          <div className="card empty-state">No announcements yet.</div>
        ) : (
          announcements.map((a: Announcement) => (
            <div className="card announce-card" key={a.id}>
              <div className="announce-top">
                <span className="announce-title">📢 {a.title}</span>
                {a.posted_by_role && <RoleBadge role={a.posted_by_role} />}
                <span className="announce-meta">
                  {a.posted_by_username ? `${a.posted_by_username} · ` : ""}
                  {new Date(a.created_at).toLocaleString()}
                </span>
                {isStaff(user.role) &&
                  (confirmDeleteId === a.id ? (
                    <div className="announce-delete-confirm">
                      <span>Delete this?</span>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ padding: "3px 10px" }}
                        onClick={() => deleteAnnouncement(a.id)}
                      >
                        Yes
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "3px 10px" }}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="msg-act-btn"
                      title="Delete announcement"
                      style={{ marginLeft: "auto" }}
                      onClick={() => deleteAnnouncement(a.id)}
                    >
                      🗑
                    </button>
                  ))}
              </div>
              <div className="announce-body">{a.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
