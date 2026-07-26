"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, isAdmin, isStaff } from "@/lib/client/AuthContext";
import { useRanks } from "@/lib/client/useRanks";
import { useAppliedTheme } from "@/lib/client/useTheme";
import { useAnnouncements } from "@/lib/client/useAnnouncements";
import { playNotifBlip, playAnnouncementChime } from "@/lib/client/sound";
import { useToast } from "./Toast";
import RoleBadge from "./RoleBadge";
import HomeView from "./views/HomeView";
import SubmitView from "./views/SubmitView";
import LeaderboardView from "./views/LeaderboardView";
import ChatView from "./views/ChatView";
import AnnouncementsView from "./views/AnnouncementsView";
import ProfileView from "./views/ProfileView";
import DashboardView from "./views/DashboardView";
import SearchView from "./views/SearchView";
import DonateView from "./views/DonateView";

export type ViewName =
  | "home"
  | "submit"
  | "leaderboard"
  | "chat"
  | "announcements"
  | "profile"
  | "dashboard"
  | "search"
  | "donate";

const NAV: { view: ViewName; label: string; icon: React.ReactNode }[] = [
  {
    view: "home",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    view: "submit",
    label: "Submit Clip",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="M21 8l-4 3 4 3z" />
      </svg>
    ),
  },
  {
    view: "leaderboard",
    label: "Leaderboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z" />
        <path d="M5 6H3v2a4 4 0 004 4M19 6h2v2a4 4 0 01-4 4" />
      </svg>
    ),
  },
  {
    view: "chat",
    label: "Community Chat",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M21 11.5a8.5 8.5 0 01-8.5 8.5H4l1.9-3.8A8.5 8.5 0 1121 11.5z" />
      </svg>
    ),
  },
  {
    view: "announcements",
    label: "Announcements",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M3 11l18-7-7 18-2-8-8-2z" />
      </svg>
    ),
  },
  {
    view: "profile",
    label: "My Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { ranks, reload: reloadRanks } = useRanks();
  useAppliedTheme(user?.theme);
  const [view, setView] = useState<ViewName>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const seenNotifIds = useRef<Set<number> | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useAnnouncements((a) => {
    playAnnouncementChime();
    toast(`📢 New announcement: ${a.title}`);
    if (viewRef.current !== "announcements") {
      setUnreadAnnouncements((n) => n + 1);
    }
  });

  if (!user) return null;

  async function loadNotifs() {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    const list = data.notifications ?? [];

    if (seenNotifIds.current === null) {
      // First load after mount: just record what exists, don't chime for history.
      seenNotifIds.current = new Set(list.map((n: any) => n.id));
    } else {
      const fresh = list.filter((n: any) => !seenNotifIds.current!.has(n.id));
      if (fresh.length > 0) {
        playNotifBlip();
        fresh.forEach((n: any) => seenNotifIds.current!.add(n.id));
      }
    }
    setNotifs(list);
  }

  useEffect(() => {
    loadNotifs();
    const id = setInterval(loadNotifs, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(v: ViewName) {
    setView(v);
    setSidebarOpen(false);
    if (v === "announcements") setUnreadAnnouncements(0);
  }

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="shell">
      {/* SIDEBAR */}
      <div className={`sidebar${sidebarOpen ? " open" : ""}`} id="sidebar">
        <div className="brand">
          <div className="brand-mark">CH4</div>
          <div>
            <div className="brand-name">CHANNEL4</div>
            <div className="brand-sub">Ops Network</div>
          </div>
        </div>

        <button className="donate-pill" onClick={() => go("donate")}>
          💛 Donate
        </button>

        <div className="navsec">
          {NAV.map((n) => (
            <button
              key={n.view}
              className={`navitem${view === n.view ? " active" : ""}`}
              onClick={() => go(n.view)}
            >
              {n.icon}
              {n.label}
              {n.view === "announcements" && unreadAnnouncements > 0 && (
                <span className="nav-badge">{unreadAnnouncements}</span>
              )}
            </button>
          ))}
        </div>

        {isStaff(user.role) && (
          <div className="navsec">
            <div className="navlabel">Command</div>
            <button
              className={`navitem${view === "dashboard" ? " active" : ""}`}
              onClick={() => go("dashboard")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
              {isAdmin(user.role) ? "Owner Dashboard" : "Mod Dashboard"}
            </button>
          </div>
        )}

        <div className="sidebar-foot">
          <div
            className="user-chip"
            onClick={() => go("profile")}
            style={{ marginTop: 10 }}
          >
            <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="uc-name">{user.username}</div>
              <div className="uc-role">
                {user.role === "Admin" ? "Co-Owner" : user.role} ·{" "}
                {user.level_label ?? `Level ${user.level}`}
              </div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            onClick={() => logout()}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <button
            className="icon-btn menu-toggle"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input
              placeholder="Search by username, level, rank, role…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setView(e.target.value.trim() ? "search" : "home");
              }}
            />
          </div>
          <div className="topbar-right">
            <div style={{ position: "relative" }} ref={notifRef}>
              <button
                className="icon-btn"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  loadNotifs();
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10 21a2 2 0 004 0" />
                </svg>
                {unreadCount > 0 && <span className="dot" />}
              </button>
              {notifOpen && (
                <div
                  className="card"
                  style={{
                    position: "absolute",
                    top: 48,
                    right: 0,
                    width: 320,
                    zIndex: 150,
                    padding: 8,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      fontWeight: 700,
                      fontSize: 13,
                      fontFamily: "'Chakra Petch',sans-serif",
                    }}
                  >
                    Notifications
                  </div>
                  {notifs.length === 0 ? (
                    <div className="empty-state small">No notifications yet.</div>
                  ) : (
                    notifs.map((n) => (
                      <div
                        key={n.id}
                        className="activity-item"
                        style={{ padding: "10px 12px", cursor: "pointer" }}
                        onClick={async () => {
                          if (!n.read) {
                            await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
                            loadNotifs();
                          }
                        }}
                      >
                        <div>
                          <div className="small" style={{ opacity: n.read ? 0.55 : 1 }}>
                            {n.text}
                          </div>
                          <div className="muted small">
                            {new Date(n.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => go("submit")}>
              + Submit Clip
            </button>
          </div>
        </div>

        <div className="view active">
          {view === "home" && <HomeView ranks={ranks} go={go} />}
          {view === "submit" && <SubmitView ranks={ranks} />}
          {view === "leaderboard" && <LeaderboardView ranks={ranks} />}
          {view === "chat" && <ChatView />}
          {view === "announcements" && <AnnouncementsView />}
          {view === "profile" && <ProfileView ranks={ranks} />}
          {view === "dashboard" && isStaff(user.role) && (
            <DashboardView ranks={ranks} reloadRanks={reloadRanks} />
          )}
          {view === "search" && <SearchView query={search} ranks={ranks} />}
          {view === "donate" && <DonateView />}
        </div>
      </div>
    </div>
  );
}
