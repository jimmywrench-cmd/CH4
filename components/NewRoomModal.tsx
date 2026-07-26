"use client";

import { useState } from "react";

export default function NewRoomModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 30);

  async function create() {
    if (!slug || !name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.room.slug);
      } else {
        setError(data.error || "Could not create room.");
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
          New Room
        </div>

        <input
          type="text"
          placeholder="Room name (e.g. Clips & Highlights)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        {slug && <div className="muted small" style={{ marginBottom: 8 }}>#{slug}</div>}
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        {error && (
          <div className="notice small" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={create}
            disabled={!name.trim() || creating}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {creating ? "Creating…" : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
