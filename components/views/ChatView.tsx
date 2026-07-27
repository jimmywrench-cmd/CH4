"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, isStaff } from "@/lib/client/AuthContext";
import { STATUSES } from "@/lib/permissions-shared";
import { useToast } from "../Toast";
import RoleBadge from "../RoleBadge";
import CustomRoleBadge, { CustomRole } from "../CustomRoleBadge";
import NewGroupModal from "../NewGroupModal";
import NewRoomModal from "../NewRoomModal";

type Active = { type: "room"; slug: string } | { type: "dm"; id: number };

// Consecutive messages from the same person within this window get
// visually grouped (Discord-style) — avatar/name only shown once.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function initials(name: string) {
  return (name || "").slice(0, 2).toUpperCase();
}

// Same window used elsewhere in the app (HomeView, ManagePlayersView)
// so "online" means the same thing everywhere.
const ONLINE_WINDOW_MS = 15 * 60 * 1000;
function isOnline(lastSeen?: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "✅"];

// Lightweight markdown: **bold**, *italic*/_italic_, `code`. No
// nesting/escaping beyond what a chat box needs.
function renderMarkdown(segment: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) {
    if (m.index > last) out.push(segment.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) {
      out.push(<b key={`${keyBase}-b${i++}`}>{t.slice(2, -2)}</b>);
    } else if (t.startsWith("`")) {
      out.push(
        <code className="msg-inline-code" key={`${keyBase}-c${i++}`}>
          {t.slice(1, -1)}
        </code>
      );
    } else {
      out.push(<i key={`${keyBase}-i${i++}`}>{t.slice(1, -1)}</i>);
    }
    last = m.index + t.length;
  }
  if (last < segment.length) out.push(segment.slice(last));
  return out;
}

// Mentions (@username) get a pill; everything else runs through the
// lite markdown pass above.
function renderRichText(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const mentionRe = /@([a-zA-Z0-9_]{3,20})/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = mentionRe.exec(text))) {
    if (m.index > last) out.push(...renderMarkdown(text.slice(last, m.index), `t${key}`));
    out.push(
      <span className="msg-mention" key={`men-${key++}`}>
        @{m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...renderMarkdown(text.slice(last), `t${key}`));
  return out;
}

export default function ChatView() {
  const { user, can } = useAuth();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [active, setActive] = useState<Active>({ type: "room", slug: "general" });
  const [dmMembers, setDmMembers] = useState<any[]>([]);
  const [roomMembers, setRoomMembers] = useState<any[]>([]);

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [showPinned, setShowPinned] = useState(false);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [profilePopover, setProfilePopover] = useState<{ member: any; x: number; y: number } | null>(
    null
  );
  const [reactingTo, setReactingTo] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(-1);

  // Only Owner/Co-Owner can manage rooms/channels or moderate chat —
  // everything else here (starting DMs and group chats, messaging in
  // them, deleting your own messages) stays open to everyone.
  const canCreateRooms = can("create_chat_rooms");
  const canDeleteRooms = can("delete_chat_rooms");
  const canModerateChat = can("manage_chat"); // pin/unpin
  const canDeleteAnyRoomMsg = can("delete_chat_messages");

  // Sidebar lists: rooms load once + refresh when a new one is made.
  // Groups poll gently so new invites show up without a refresh.
  async function loadRooms() {
    try {
      const res = await fetch("/api/chat/rooms");
      const data = await safeJson(res);
      if (!res.ok) {
        setSidebarError(data.error || `Couldn't load rooms (${res.status}).`);
        return;
      }
      setRooms(data.rooms ?? []);
      setSidebarError(null);
    } catch {
      setSidebarError("Couldn't reach the server to load rooms.");
    }
  }
  async function loadGroups() {
    try {
      const res = await fetch("/api/dms");
      const data = await safeJson(res);
      if (!res.ok) {
        setSidebarError((prev) => prev ?? data.error ?? `Couldn't load DMs (${res.status}).`);
        return;
      }
      setGroups(data.groups ?? []);
    } catch {
      setSidebarError((prev) => prev ?? "Couldn't reach the server to load DMs.");
    }
  }
  async function loadRoomMembers() {
    try {
      const res = await fetch("/api/leaderboard?tab=level");
      const data = await safeJson(res);
      if (res.ok) setRoomMembers(data.users ?? []);
    } catch {
      // Member list is supplementary — fail quietly.
    }
  }

  useEffect(() => {
    loadRooms();
    loadGroups();
    loadRoomMembers();
    const id = setInterval(() => {
      loadGroups();
      loadRoomMembers();
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Active conversation's messages.
  async function loadMessages() {
    try {
      if (active.type === "room") {
        const res = await fetch(`/api/chat?room=${encodeURIComponent(active.slug)}`);
        const data = await safeJson(res);
        if (!res.ok) {
          setMessagesError(data.error || `Couldn't load messages (${res.status}).`);
          setMessagesLoading(false);
          return;
        }
        setMessages(data.messages ?? []);
      } else {
        const res = await fetch(`/api/dms/${active.id}`);
        const data = await safeJson(res);
        if (!res.ok) {
          setMessagesError(data.error || `Couldn't load messages (${res.status}).`);
          setMessagesLoading(false);
          return;
        }
        setMessages(data.messages ?? []);
        setDmMembers(data.members ?? []);
      }
      setMessagesError(null);
      setMessagesLoading(false);
    } catch {
      setMessagesError("Couldn't reach the server to load messages.");
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    setMessagesLoading(true);
    setMessages([]);
    setShowPinned(false);
    setEditingId(null);
    setReactingTo(null);
    setProfilePopover(null);
    setMentionQuery(null);
    loadMessages();
    const id = setInterval(loadMessages, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.type, active.type === "room" ? active.slug : active.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!user) return null;

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    const url = active.type === "room" ? "/api/chat" : `/api/dms/${active.id}`;
    const body =
      active.type === "room"
        ? { text, reply_to_id: replyTo?.id ?? null, room: active.slug }
        : { text, reply_to_id: replyTo?.id ?? null };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setReplyTo(null);
        loadMessages();
        if (active.type === "dm") loadGroups();
      } else {
        const data = await safeJson(res);
        setInput(text);
        toast(data.error || `Could not send message (${res.status}).`);
      }
    } catch {
      setInput(text);
      toast("Could not reach the server to send that.");
    } finally {
      setSending(false);
    }
  }

  async function deleteMsg(id: number) {
    const url =
      active.type === "room" ? `/api/chat/${id}` : `/api/dms/${active.id}?message_id=${id}`;
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) loadMessages();
      else {
        const data = await safeJson(res);
        toast(data.error || "Could not delete message.");
      }
    } catch {
      toast("Could not reach the server to delete that.");
    }
  }

  async function togglePin(id: number) {
    try {
      const res = await fetch(`/api/chat/${id}/pin`, { method: "POST" });
      if (res.ok) loadMessages();
      else {
        const data = await safeJson(res);
        toast(data.error || "Could not pin that message.");
      }
    } catch {
      toast("Could not reach the server to pin that.");
    }
  }

  async function react(id: number, emoji: string) {
    setReactingTo(null);
    try {
      const res = await fetch(`/api/chat/${id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) loadMessages();
      else {
        const data = await safeJson(res);
        toast(data.error || "Could not react to that message.");
      }
    } catch {
      toast("Could not reach the server to react.");
    }
  }

  function startEdit(m: any) {
    setEditingId(m.id);
    setEditText(m.text);
  }

  async function saveEdit(id: number) {
    const text = editText.trim();
    if (!text) return;
    try {
      const res = await fetch(`/api/chat/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setEditingId(null);
        loadMessages();
      } else {
        const data = await safeJson(res);
        toast(data.error || "Could not save that edit.");
      }
    } catch {
      toast("Could not reach the server to save that edit.");
    }
  }

  function openProfile(e: React.MouseEvent, member: any) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 280);
    const y = Math.min(rect.bottom + 6, window.innerHeight - 260);
    setProfilePopover({ member, x: Math.max(8, x), y: Math.max(8, y) });
  }

  function memberInfo(userId: string, fallback: any) {
    return panelMembers.find((m) => m.id === userId) ?? fallback;
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    const caret = e.target.selectionStart ?? val.length;
    const upto = val.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([a-zA-Z0-9_]{0,20})$/);
    if (m) {
      setMentionQuery(m[1].toLowerCase());
      setMentionStart(caret - m[1].length - 1);
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }
  }

  function pickMention(username: string) {
    const caret = mentionStart + 1 + (mentionQuery?.length ?? 0);
    const next = `${input.slice(0, mentionStart)}@${username} ${input.slice(caret)}`;
    setInput(next);
    setMentionQuery(null);
    setMentionStart(-1);
    inputRef.current?.focus();
  }

  async function deleteRoom(slug: string) {
    if (slug === "general") return;
    if (!window.confirm(`Delete #${slug}? This permanently deletes the room and its messages.`)) {
      return;
    }
    setDeletingRoom(slug);
    try {
      const res = await fetch(`/api/chat/rooms/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (active.type === "room" && active.slug === slug) {
          setActive({ type: "room", slug: "general" });
        }
        loadRooms();
      } else {
        const data = await safeJson(res);
        toast(data.error || "Could not delete room.");
      }
    } catch {
      toast("Could not reach the server to delete that room.");
    } finally {
      setDeletingRoom(null);
    }
  }

  const activeRoom = active.type === "room" ? rooms.find((r) => r.slug === active.slug) : null;
  const activeGroup = active.type === "dm" ? groups.find((g) => g.id === active.id) : null;

  function groupLabel(g: any) {
    if (!g) return "";
    if (g.name) return g.name;
    const names = (g.other_members ?? []).map((m: any) => m.username);
    return names.length ? names.join(", ") : "Empty group";
  }

  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);

  // Who shows in the right-hand member panel: everyone for a room,
  // just this group's members for a DM.
  const panelMembers = active.type === "room" ? roomMembers : dmMembers;
  const onlineCount = useMemo(
    () => panelMembers.filter((m) => isOnline(m.last_seen)).length,
    [panelMembers]
  );
  const memberGroups = useMemo(() => {
    const buckets: Record<string, any[]> = {};
    for (const m of panelMembers) {
      (buckets[m.role] ??= []).push(m);
    }
    for (const list of Object.values(buckets)) {
      list.sort((a, b) => {
        const onlineDiff = Number(isOnline(b.last_seen)) - Number(isOnline(a.last_seen));
        return onlineDiff !== 0 ? onlineDiff : a.username.localeCompare(b.username);
      });
    }
    return STATUSES.map((status) => ({ status, members: buckets[status] ?? [] })).filter(
      (g) => g.members.length > 0
    );
  }, [panelMembers]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    return panelMembers
      .filter((m) => m.username.toLowerCase().startsWith(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, panelMembers]);

  // Rooms grouped into Discord-style categories, in the order the
  // API returns them (category first, "general" pinned to the top).
  const roomCategories = useMemo(() => {
    const order: string[] = [];
    const buckets: Record<string, any[]> = {};
    for (const r of rooms) {
      const cat = r.category || "Text Channels";
      if (!buckets[cat]) {
        buckets[cat] = [];
        order.push(cat);
      }
      buckets[cat].push(r);
    }
    return order.map((cat) => ({ category: cat, rooms: buckets[cat] }));
  }, [rooms]);

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Chat
      </div>
      <div className={`chat-wrap chat-wrap-discord${showMembers ? "" : " members-hidden"}`}>
        {/* CONVERSATION LIST */}
        <div className="card chat-sidebar">
          <div className="chat-server-banner">
            <div className="chat-server-icon">C4</div>
            <div className="chat-server-info">
              <div className="chat-server-name">Channel4</div>
              <div className="chat-server-sub">Ops Network</div>
            </div>
          </div>
          {sidebarError && (
            <div className="notice small" style={{ marginBottom: 4 }}>
              {sidebarError}
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  setSidebarError(null);
                  loadRooms();
                  loadGroups();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {rooms.length === 0 && !sidebarError && (
            <div className="empty-state small" style={{ padding: "10px 12px" }}>
              No rooms yet.
            </div>
          )}
          {roomCategories.map(({ category, rooms: catRooms }) => {
            const collapsed = collapsedCategories.has(category);
            return (
              <div className="chat-sidebar-section" key={category}>
                <div
                  className="chat-sidebar-head chat-category-head"
                  onClick={() =>
                    setCollapsedCategories((prev) => {
                      const next = new Set(prev);
                      next.has(category) ? next.delete(category) : next.add(category);
                      return next;
                    })
                  }
                >
                  <span>
                    <span className={`chat-category-chevron${collapsed ? " collapsed" : ""}`}>▾</span>
                    {category}
                  </span>
                  {canCreateRooms && (
                    <button
                      className="icon-btn-sm"
                      title="New room"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowNewRoom(true);
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
                {!collapsed &&
                  catRooms.map((r) => (
                    <div key={r.id} className="chat-convo-row">
                      <button
                        className={`chat-convo-item${
                          active.type === "room" && active.slug === r.slug ? " active" : ""
                        }`}
                        onClick={() => setActive({ type: "room", slug: r.slug })}
                      >
                        <span className="chat-convo-hash">#</span>
                        {r.name}
                      </button>
                      {canDeleteRooms && r.slug !== "general" && (
                        <button
                          className="chat-convo-delete"
                          title={`Delete #${r.slug}`}
                          disabled={deletingRoom === r.slug}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRoom(r.slug);
                          }}
                        >
                          {deletingRoom === r.slug ? "…" : "🗑"}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            );
          })}

          <div className="chat-sidebar-section">
            <div className="chat-sidebar-head">
              <span>Direct Messages</span>
              <button className="icon-btn-sm" title="New group" onClick={() => setShowNewGroup(true)}>
                +
              </button>
            </div>
            {groups.length === 0 && (
              <div className="empty-state small" style={{ padding: "10px 12px" }}>
                No groups yet.
              </div>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                className={`chat-convo-item${
                  active.type === "dm" && active.id === g.id ? " active" : ""
                }`}
                onClick={() => setActive({ type: "dm", id: g.id })}
              >
                <div className="avatar" style={{ width: 22, height: 22, fontSize: 9 }}>
                  {initials(groupLabel(g))}
                </div>
                <span className="chat-convo-name">{groupLabel(g)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* MESSAGES */}
        <div className="card chat-panel">
          <div className="chat-head">
            <span className="online-status" />
            <span className="small" style={{ fontWeight: 600 }}>
              {active.type === "room"
                ? `#${activeRoom?.slug ?? active.slug}`
                : groupLabel(activeGroup)}
            </span>
            {active.type === "room" && activeRoom?.description && (
              <>
                <span className="chat-head-divider" />
                <span className="small muted">{activeRoom.description}</span>
              </>
            )}
            {active.type === "dm" && (
              <>
                <span className="chat-head-divider" />
                <span className="small muted">{dmMembers.length} members</span>
              </>
            )}
            <div className="chat-head-actions">
              {active.type === "room" && pinnedMessages.length > 0 && (
                <button
                  className={`chat-head-btn${showPinned ? " active" : ""}`}
                  title="Pinned messages"
                  onClick={() => setShowPinned((v) => !v)}
                >
                  📌 {pinnedMessages.length}
                </button>
              )}
              <button
                className={`chat-head-btn${showMembers ? " active" : ""}`}
                title={showMembers ? "Hide members" : "Show members"}
                onClick={() => setShowMembers((v) => !v)}
              >
                👥
              </button>
            </div>
          </div>

          {active.type === "room" && showPinned && pinnedMessages.length > 0 && (
            <div className="chat-pin-list">
              {pinnedMessages.map((m) => (
                <div className="chat-pin" key={m.id}>
                  📌 <b>{m.username}</b>: {m.text.slice(0, 90)}
                  {canModerateChat && (
                    <button
                      className="msg-act-btn"
                      style={{ marginLeft: "auto" }}
                      title="Unpin"
                      onClick={() => togglePin(m.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="chat-msgs">
            {messagesLoading && (
              <div className="empty-state small">
                <span className="spinner" style={{ marginRight: 8, verticalAlign: -2 }} />
                Loading messages…
              </div>
            )}
            {!messagesLoading && messagesError && (
              <div className="notice small" style={{ marginBottom: 0 }}>
                {messagesError}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: "auto" }}
                  onClick={() => {
                    setMessagesLoading(true);
                    loadMessages();
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {!messagesLoading &&
              !messagesError &&
              messages.map((m, i) => {
                const own = m.user_id === user.id;
                const canDelete =
                  own || (active.type === "room" ? canDeleteAnyRoomMsg : isStaff(user.role));
                const canPin = active.type === "room" && canModerateChat;

                const prev = messages[i - 1];
                const grouped =
                  !!prev &&
                  prev.user_id === m.user_id &&
                  !m.reply_username &&
                  new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() <
                    GROUP_WINDOW_MS;

                return (
                  <div
                    className={`msg${own ? " msg-own" : ""}${grouped ? " msg-grouped" : ""}${
                      m.pinned ? " msg-pinned" : ""
                    }`}
                    key={m.id}
                  >
                    {grouped ? (
                      <span className="msg-time-gutter">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : (
                      <div
                        className="avatar"
                        style={{ width: 32, height: 32, fontSize: 11, cursor: "pointer" }}
                        onClick={(e) =>
                          openProfile(
                            e,
                            memberInfo(m.user_id, {
                              id: m.user_id,
                              username: m.username,
                              role: m.role,
                              level: m.level,
                              level_label: m.level_label,
                              custom_roles: m.custom_roles,
                            })
                          )
                        }
                      >
                        {initials(m.username)}
                      </div>
                    )}
                    <div className="msg-body">
                      {m.reply_username && (
                        <div className="msg-reply-ref">
                          ↳ replying to {m.reply_username}: {m.reply_text?.slice(0, 60)}
                        </div>
                      )}
                      {!grouped && (
                        <div className="msg-top">
                          <span
                            className="msg-name"
                            style={{ cursor: "pointer" }}
                            onClick={(e) =>
                              openProfile(
                                e,
                                memberInfo(m.user_id, {
                                  id: m.user_id,
                                  username: m.username,
                                  role: m.role,
                                  level: m.level,
                                  level_label: m.level_label,
                                  custom_roles: m.custom_roles,
                                })
                              )
                            }
                          >
                            {m.username}
                          </span>
                          <RoleBadge role={m.role} />
                          {(m.custom_roles ?? []).map((r: CustomRole) => (
                            <CustomRoleBadge key={r.id} role={r} size="sm" />
                          ))}
                          <span className="msg-meta">
                            {m.level_label ?? `Level ${m.level}`} ·{" "}
                            {new Date(m.created_at).toLocaleTimeString()}
                          </span>
                          {m.pinned && <span className="msg-pin-flag">📌 pinned</span>}
                        </div>
                      )}
                      {editingId === m.id ? (
                        <div className="msg-edit-row">
                          <input
                            value={editText}
                            autoFocus
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(m.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={() => saveEdit(m.id)}>
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="msg-text">
                          {renderRichText(m.text)}
                          {m.edited_at && <span className="msg-edited-flag"> (edited)</span>}
                        </div>
                      )}
                      {active.type === "room" && (m.reactions ?? []).length > 0 && (
                        <div className="msg-reactions">
                          {m.reactions.map((r: any) => (
                            <button
                              key={r.emoji}
                              className={`msg-reaction${r.reacted ? " mine" : ""}`}
                              onClick={() => react(m.id, r.emoji)}
                              title={r.reacted ? "Remove your reaction" : "React"}
                            >
                              <span>{r.emoji}</span>
                              <span className="msg-reaction-count">{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="msg-actions">
                      <button className="msg-act-btn" title="Reply" onClick={() => setReplyTo(m)}>
                        ↩
                      </button>
                      {active.type === "room" && (
                        <button
                          className="msg-act-btn"
                          title="React"
                          onClick={() => setReactingTo(reactingTo === m.id ? null : m.id)}
                        >
                          😀
                        </button>
                      )}
                      {active.type === "room" && own && (
                        <button className="msg-act-btn" title="Edit" onClick={() => startEdit(m)}>
                          ✏️
                        </button>
                      )}
                      {canPin && (
                        <button
                          className="msg-act-btn"
                          title={m.pinned ? "Unpin" : "Pin"}
                          onClick={() => togglePin(m.id)}
                        >
                          📌
                        </button>
                      )}
                      {canDelete && (
                        <button className="msg-act-btn" title="Delete" onClick={() => deleteMsg(m.id)}>
                          🗑
                        </button>
                      )}
                    </div>
                    {reactingTo === m.id && (
                      <>
                        <div className="popover-overlay" onClick={() => setReactingTo(null)} />
                        <div className="msg-reaction-picker">
                          {QUICK_EMOJI.map((e) => (
                            <button key={e} className="msg-reaction-picker-btn" onClick={() => react(m.id, e)}>
                              {e}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            {!messagesLoading && !messagesError && messages.length === 0 && (
              <div className="empty-state small">No messages yet — say hello.</div>
            )}
            <div ref={bottomRef} />
          </div>
          {replyTo && (
            <div className="reply-banner">
              Replying to <b>{replyTo.username}</b>: {replyTo.text.slice(0, 60)}
              <button onClick={() => setReplyTo(null)}>✕</button>
            </div>
          )}
          <div className="chat-input-wrap-outer">
            {mentionCandidates.length > 0 && (
              <div className="mention-dropdown">
                {mentionCandidates.map((m: any) => (
                  <button key={m.id} className="mention-dropdown-item" onClick={() => pickMention(m.username)}>
                    <div className="avatar" style={{ width: 20, height: 20, fontSize: 9 }}>
                      {initials(m.username)}
                    </div>
                    {m.username}
                  </button>
                ))}
              </div>
            )}
            <div className="chat-input-wrap">
              <input
                ref={inputRef}
                placeholder={active.type === "room" ? `Message #${active.slug}` : "Message this group"}
                value={input}
                disabled={!!messagesError}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (mentionCandidates.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
                    e.preventDefault();
                    pickMention(mentionCandidates[0].username);
                    return;
                  }
                  if (e.key === "Escape") setMentionQuery(null);
                  if (e.key === "Enter") send();
                }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={send}
                disabled={!input.trim() || sending || !!messagesError}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* MEMBER LIST */}
        {showMembers && (
          <div className="card chat-members">
            <div className="chat-members-head">
              {onlineCount} Online — {panelMembers.length} Members
            </div>
            {memberGroups.length === 0 && (
              <div className="empty-state small" style={{ padding: "10px 12px" }}>
                Nobody here yet.
              </div>
            )}
            {memberGroups.map(({ status, members }) => (
              <div className="member-group" key={status}>
                <div className="member-group-head">
                  {status} — {members.length}
                </div>
                {members.map((m: any) => (
                  <div
                    className="member-row"
                    key={m.id}
                    onClick={(e) => openProfile(e, m)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="member-avatar-wrap">
                      <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                        {initials(m.username)}
                      </div>
                      <span className={`member-status-dot${isOnline(m.last_seen) ? " online" : ""}`} />
                    </div>
                    <span className={`member-name${isOnline(m.last_seen) ? "" : " offline"}`}>
                      {m.username}
                    </span>
                    {(m.custom_roles ?? []).slice(0, 1).map((r: CustomRole) => (
                      <CustomRoleBadge key={r.id} role={r} size="sm" />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {profilePopover && (
        <>
          <div className="popover-overlay" onClick={() => setProfilePopover(null)} />
          <div
            className="card profile-popover"
            style={{ left: profilePopover.x, top: profilePopover.y }}
          >
            <div className="profile-popover-avatar-row">
              <div className="avatar profile-popover-avatar">
                {initials(profilePopover.member.username)}
              </div>
              <span
                className={`profile-status-dot${
                  isOnline(profilePopover.member.last_seen) ? " online" : ""
                }`}
              />
            </div>
            <div className="profile-popover-name">{profilePopover.member.username}</div>
            <div className="profile-popover-badges">
              <RoleBadge role={profilePopover.member.role} />
              {(profilePopover.member.custom_roles ?? []).map((r: CustomRole) => (
                <CustomRoleBadge key={r.id} role={r} size="sm" />
              ))}
            </div>
            <div className="profile-popover-level">
              {profilePopover.member.level_label ?? `Level ${profilePopover.member.level}`}
            </div>
            {profilePopover.member.bio && (
              <div className="profile-popover-bio">{profilePopover.member.bio}</div>
            )}
            {profilePopover.member.last_seen && (
              <div className="profile-popover-meta">
                {isOnline(profilePopover.member.last_seen)
                  ? "Online now"
                  : `Last seen ${timeAgo(profilePopover.member.last_seen)}`}
              </div>
            )}
          </div>
        </>
      )}

      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={(id) => {
            setShowNewGroup(false);
            loadGroups();
            setActive({ type: "dm", id });
          }}
        />
      )}
      {showNewRoom && (
        <NewRoomModal
          onClose={() => setShowNewRoom(false)}
          categories={roomCategories.map((c) => c.category)}
          onCreated={(slug) => {
            setShowNewRoom(false);
            loadRooms();
            setActive({ type: "room", slug });
          }}
        />
      )}
    </div>
  );
}
