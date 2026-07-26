"use client";

import { useEffect, useState } from "react";
import { useToast } from "../Toast";
import RoleBadge from "../RoleBadge";

// Kept as plain string arrays here (rather than importing from
// lib/permissions-shared) so this client component has no import
// path into server-only code — the matrix shape from the API is the
// source of truth at render time regardless.
const STATUSES = ["Owner", "Co-Owner", "Admin", "Moderator", "Helper", "Verified", "Member"];

const PERMISSION_LABELS: Record<string, string> = {
  manage_announcements: "Manage announcements",
  create_announcements: "Create announcements",
  manage_chat: "Manage chat",
  delete_chat_messages: "Delete chat messages",
  mute_users: "Mute users",
  suspend_users: "Suspend users",
  ban_users: "Ban users",
  unban_users: "Unban users",
  delete_users: "Delete users",
  manage_reports: "Manage reports",
  accept_videos: "Accept videos",
  deny_videos: "Deny videos",
  edit_users: "Edit users",
  change_usernames: "Change usernames",
  change_profile_pictures: "Change profile pictures",
  change_user_levels: "Change user levels",
  change_user_ranks: "Change user ranks",
  change_user_statuses: "Change user statuses",
  create_custom_roles: "Create custom roles",
  edit_custom_roles: "Edit custom roles",
  delete_custom_roles: "Delete custom roles",
  assign_custom_roles: "Assign custom roles",
  manage_rooms: "Manage rooms",
  create_chat_rooms: "Create chat rooms",
  delete_chat_rooms: "Delete chat rooms",
  manage_website_settings: "Manage website settings",
  manage_rank_requirements: "Manage rank requirements",
  edit_status_permissions: "Edit Status Permissions",
  view_analytics: "View analytics",
  export_data: "Export data",
  access_beta_tools: "Access beta tools",
};

type Matrix = Record<string, Record<string, boolean>>;

export default function StatusPermissionsView() {
  const { toast } = useToast();
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function load() {
    const res = await fetch("/api/status-permissions");
    const data = await res.json();
    if (res.ok) setMatrix(data.matrix);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(status: string, permission: string, next: boolean) {
    if (!matrix) return;
    if (status === "Owner") return; // immutable, checkbox is disabled anyway

    // Optimistic update.
    const prev = matrix;
    setMatrix({
      ...matrix,
      [status]: { ...matrix[status], [permission]: next },
    });
    setSaving(`${status}:${permission}`);

    const res = await fetch("/api/status-permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, permission, enabled: next }),
    });

    setSaving(null);
    if (!res.ok) {
      setMatrix(prev);
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Could not update permission.");
      return;
    }
    const data = await res.json();
    setMatrix(data.matrix);
  }

  async function resetToDefault() {
    if (!confirm("Reset ALL statuses to their default permissions? This can't be undone.")) {
      return;
    }
    setResetting(true);
    const res = await fetch("/api/status-permissions/reset", { method: "POST" });
    setResetting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Could not reset permissions.");
      return;
    }
    const data = await res.json();
    setMatrix(data.matrix);
    toast("Permissions reset to default.");
  }

  const permissionKeys = matrix ? Object.keys(PERMISSION_LABELS) : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Status Permissions</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Toggle exactly what each status can do. Owner is always fully permitted and can't
            be edited.
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={resetToDefault}
          disabled={resetting || !matrix}
        >
          {resetting ? "Resetting…" : "Reset to Default"}
        </button>
      </div>

      {!matrix ? (
        <div className="card muted" style={{ padding: 30, textAlign: "center" }}>
          Loading permissions…
        </div>
      ) : (
        <div className="card" style={{ padding: "6px 10px", overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left", minWidth: 200 }}>Permission</th>
                {STATUSES.map((status) => (
                  <th key={status} style={{ textAlign: "center", minWidth: 90 }}>
                    <RoleBadge role={status} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionKeys.map((perm) => (
                <tr key={perm}>
                  <td>{PERMISSION_LABELS[perm]}</td>
                  {STATUSES.map((status) => {
                    const immutable = status === "Owner";
                    const checked = !!matrix[status]?.[perm];
                    const busy = saving === `${status}:${perm}`;
                    return (
                      <td key={status} style={{ textAlign: "center" }}>
                        <select
                          className="perm-select"
                          data-state={checked ? "allow" : "deny"}
                          value={checked ? "allow" : "deny"}
                          disabled={immutable || busy}
                          onChange={(e) => toggle(status, perm, e.target.value === "allow")}
                          style={{ cursor: immutable ? "not-allowed" : "pointer" }}
                        >
                          <option value="allow">Allowed</option>
                          <option value="deny">Denied</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
