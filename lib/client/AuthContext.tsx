"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Role =
  | "Member"
  | "Verified"
  | "Moderator"
  | "Admin"
  | "Owner"
  | "Co-Owner"
  | "Helper";

// Kept loose (string keys) here rather than importing the full
// Permission union from lib/permissions-shared, so this file has zero
// dependency edges either way — the server is the source of truth and
// sends back whatever keys apply.
export type PermissionMap = Record<string, boolean>;

export type SessionUser = {
  id: string;
  username: string;
  role: Role;
  level: number;
  level_label: string | null;
  bio: string;
  avatar_seed: string;
  approved_count: number;
  rejected_count: number;
  suspended: boolean;
  banned: boolean;
  created_at: string;
  theme?: "light" | "dark" | "system" | null;
};

type AuthState = {
  user: SessionUser | null;
  permissions: PermissionMap;
  can: (permission: string) => boolean;
  loading: boolean;
  refresh: (silent?: boolean) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);

  // `silent` skips the loading flag so background polls don't flash the
  // full-screen spinner (page.tsx shows a spinner whenever loading=true).
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setUser(data.user ?? null);
      setPermissions(data.permissions ?? {});
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setPermissions({});
  }, []);

  useEffect(() => {
    refresh();
    // Keep session data (level, role, approved/rejected counts, staff
    // status, suspended/banned, permissions, etc.) live without
    // requiring a manual page reload — mirrors the polling already
    // used for chat/announcements/notifications elsewhere in the app.
    // Silent so it doesn't interrupt whatever the user is doing.
    const id = setInterval(() => refresh(true), 20000);
    return () => clearInterval(id);
  }, [refresh]);

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.role === "Owner") return true;
      return !!permissions[permission];
    },
    [user, permissions]
  );

  return (
    <AuthContext.Provider value={{ user, permissions, can, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function isStaff(role: Role) {
  return (
    role === "Helper" ||
    role === "Moderator" ||
    role === "Admin" ||
    role === "Co-Owner" ||
    role === "Owner"
  );
}
export function isAdmin(role: Role) {
  return role === "Admin" || role === "Co-Owner" || role === "Owner";
}
export function isOwner(role: Role) {
  return role === "Owner";
}
export function isOwnerOrCoOwner(role: Role) {
  return role === "Owner" || role === "Co-Owner";
}
