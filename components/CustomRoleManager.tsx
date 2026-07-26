"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import CustomRoleBadge, { CustomRole } from "./CustomRoleBadge";

const SWATCHES = [
  "#e6e6e6", "#4d7dff", "#7d6bff", "#9b5cff", "#c896ff",
  "#ffc94d", "#ff9f4d", "#ff5c5c", "#4dff9f", "#4dd9ff",
];

const emptyDraft = {
  name: "",
  color: SWATCHES[1],
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  icon: "",
};

export default function CustomRoleManager({
  roles,
  onClose,
  onChanged,
}: {
  roles: CustomRole[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  function startCreate() {
    setEditingId("new");
    setDraft(emptyDraft);
  }
  function startEdit(r: CustomRole) {
    setEditingId(r.id);
    setDraft({
      name: r.name,
      color: r.color,
      bold: r.bold,
      italic: r.italic,
      underline: r.underline,
      strikethrough: r.strikethrough,
      icon: r.icon ?? "",
    });
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) return toast("Give the role a name first.");
    setSaving(true);
    try {
      const isNew = editingId === "new";
      const res = await fetch(isNew ? "/api/custom-roles" : `/api/custom-roles/${editingId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          color: draft.color,
          bold: draft.bold,
          italic: draft.italic,
          underline: draft.underline,
          strikethrough: draft.strikethrough,
          icon: draft.icon.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast(data.error || "Could not save role.");
      toast(isNew ? "Custom role created." : "Custom role updated.");
      setEditingId(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/custom-roles/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not delete role.");
    toast("Custom role deleted.");
    onChanged();
  }

  const previewRole: CustomRole = {
    id: "preview",
    name: draft.name.trim() || "Role Name",
    color: draft.color,
    bold: draft.bold,
    italic: draft.italic,
    underline: draft.underline,
    strikethrough: draft.strikethrough,
    icon: draft.icon.trim() || null,
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="card modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, maxHeight: "85vh", overflowY: "auto" }}
      >
        <div className="section-title" style={{ fontSize: 14 }}>
          <span className="accent-bar" />
          Custom Roles
        </div>

        {!editingId && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {roles.length === 0 && (
                <div className="muted small">No custom roles yet — create one below.</div>
              )}
              {roles.map((r) => (
                <div
                  key={r.id}
                  className="flex"
                  style={{ alignItems: "center", justifyContent: "space-between", gap: 8 }}
                >
                  <CustomRoleBadge role={r} />
                  <div className="flex gap8">
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap8">
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                Close
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={startCreate}
              >
                + Create Custom Role
              </button>
            </div>
          </>
        )}

        {editingId && (
          <>
            <div style={{ marginBottom: 10 }}>
              <CustomRoleBadge role={previewRole} />
            </div>

            <div className="field">
              <label>Role Name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Beta Tester"
                maxLength={40}
              />
            </div>

            <div className="field">
              <label>Text Color</label>
              <div className="flex gap8" style={{ flexWrap: "wrap" }}>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft((d) => ({ ...d, color: c }))}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      background: c,
                      border: draft.color === c ? "2px solid #fff" : "1px solid var(--border)",
                    }}
                    title={c}
                  />
                ))}
                <input
                  type="text"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="mono"
                  style={{ width: 90, padding: "4px 8px" }}
                />
              </div>
            </div>

            <div className="field">
              <label>Font Style</label>
              <div className="flex gap8" style={{ flexWrap: "wrap" }}>
                {(["bold", "italic", "underline", "strikethrough"] as const).map((key) => (
                  <button
                    key={key}
                    className={`btn btn-sm ${draft[key] ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setDraft((d) => ({ ...d, [key]: !d[key] }))}
                  >
                    {key === "bold" && "B"}
                    {key === "italic" && "I"}
                    {key === "underline" && "U"}
                    {key === "strikethrough" && "S"}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Icon / Emoji (optional)</label>
              <input
                type="text"
                value={draft.icon}
                onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
                placeholder="🧪"
                maxLength={8}
                style={{ width: 90 }}
              />
            </div>

            <div className="flex gap8" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                Back
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={save}
                disabled={saving || !draft.name.trim()}
              >
                {saving ? "Saving…" : "Save Role"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
