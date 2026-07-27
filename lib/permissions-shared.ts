// No "server-only" here on purpose — this file is imported from both
// server code (lib/permissions.ts, API routes) and client code
// (AuthContext, StatusPermissionsView). It contains no secrets, just
// the shared catalog + defaults so both sides can never drift apart.

export const STATUSES = [
  "Owner",
  "Co-Owner",
  "Admin",
  "Moderator",
  "Helper",
  "Verified",
  "Member",
] as const;

export type Status = (typeof STATUSES)[number];

// Statuses whose row in the matrix can never be edited (always all-true).
// Only "Owner" — Co-Owner starts identical to Owner but is editable,
// per spec ("Has the same permissions as Owner by default").
export const IMMUTABLE_STATUSES: Status[] = ["Owner"];

export const PERMISSIONS = [
  "manage_announcements",
  "create_announcements",
  "manage_chat",
  "delete_chat_messages",
  "mute_users",
  "suspend_users",
  "ban_users",
  "unban_users",
  "delete_users",
  "manage_reports",
  "accept_videos",
  "deny_videos",
  "edit_users",
  "change_usernames",
  "change_profile_pictures",
  "change_user_levels",
  "change_user_ranks",
  "change_user_statuses",
  "create_custom_roles",
  "edit_custom_roles",
  "delete_custom_roles",
  "assign_custom_roles",
  "manage_rooms",
  "create_chat_rooms",
  "delete_chat_rooms",
  "manage_website_settings",
  "manage_rank_requirements",
  "edit_status_permissions",
  "view_analytics",
  "export_data",
  "access_beta_tools",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Display labels for the Status Permissions page grid.
export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_announcements: "Manage announcements",
  create_announcements: "Create announcements",
  manage_chat: "Manage chat (pin/unpin, moderate)",
  delete_chat_messages: "Delete chat messages",
  mute_users: "Mute users",
  suspend_users: "Suspend / unsuspend users",
  ban_users: "Ban users",
  unban_users: "Unban users",
  delete_users: "Delete users",
  manage_reports: "Manage reports",
  accept_videos: "Accept submitted videos",
  deny_videos: "Deny submitted videos",
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

export type PermissionMatrix = Record<Status, Record<Permission, boolean>>;

const ALL_TRUE: Record<Permission, boolean> = Object.fromEntries(
  PERMISSIONS.map((p) => [p, true])
) as Record<Permission, boolean>;

const ALL_FALSE: Record<Permission, boolean> = Object.fromEntries(
  PERMISSIONS.map((p) => [p, false])
) as Record<Permission, boolean>;

// Admin: everything except delete_users, change_user_statuses,
// edit_status_permissions, manage_rank_requirements.
const ADMIN_OFF: Permission[] = [
  "delete_users",
  "change_user_statuses",
  "edit_status_permissions",
  "manage_rank_requirements",
];

// Moderator: Admin's restrictions, plus ban_users, all custom-role
// management, and changing levels/ranks.
const MODERATOR_OFF: Permission[] = [
  ...ADMIN_OFF,
  "ban_users",
  "create_custom_roles",
  "edit_custom_roles",
  "delete_custom_roles",
  "assign_custom_roles",
  "change_user_levels",
  "change_user_ranks",
];

// Helper: normal member permissions, plus suspend/unsuspend and
// video review.
const HELPER_ON: Permission[] = ["suspend_users", "accept_videos", "deny_videos"];

function withOverrides(base: Record<Permission, boolean>, offKeys: Permission[]) {
  const result = { ...base };
  for (const key of offKeys) result[key] = false;
  return result;
}

function onlyThese(onKeys: Permission[]) {
  const result = { ...ALL_FALSE };
  for (const key of onKeys) result[key] = true;
  return result;
}

export const DEFAULT_MATRIX: PermissionMatrix = {
  Owner: { ...ALL_TRUE },
  "Co-Owner": { ...ALL_TRUE },
  Admin: withOverrides(ALL_TRUE, ADMIN_OFF),
  Moderator: withOverrides(ALL_TRUE, MODERATOR_OFF),
  Helper: onlyThese(HELPER_ON),
  Verified: { ...ALL_FALSE },
  Member: { ...ALL_FALSE },
};

export function isValidStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isValidPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
