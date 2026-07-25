"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Role = "Member" | "Verified" | "Moderator" | "Admin" | "Owner";

export type SessionUser = {
  id: string;
  username: string;
  role: Role;
  level: number;
  bio: string;
  avatar_seed: string;
  approved_count: number;
  rejected_count: number;
  suspended: boolean;
  banned: boolean;
  created_at: string;
};

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setUser(data.user ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
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
  return role === "Moderator" || role === "Admin" || role === "Owner";
}
export function isAdmin(role: Role) {
  return role === "Admin" || role === "Owner";
}
export function isOwner(role: Role) {
  return role === "Owner";
}
