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
  const memberGroups = useMemo(() => {
    const buckets: Record<string, any[]> = {};
    for (const m of panelMembers) {
      (buckets[m.role] ??= []).push(m);
    }
    return STATUSES.map((status) => ({ status, members: buckets[status] ?? [] })).filter(
      (g) => g.members.length > 0
    );
  }, [panelMembers]);

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Chat
      </div>
      <div className={`chat-wrap chat-wrap-discord${showMembers ? "" : " members-hidden"}`}>
        {/* CONVERSATION LIST */}
        <div className="card chat-sidebar">
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
          <div className="chat-sidebar-section">
            <div className="chat-sidebar-head">
              <span>Rooms</span>
              {canCreateRooms && (
                <button className="icon-btn-sm" title="New room" onClick={() => setShowNewRoom(true)}>
                  +
                </button>
              )}
            </div>
            {rooms.length === 0 && !sidebarError && (
              <div className="empty-state small" style={{ padding: "10px 12px" }}>
                No rooms yet.
              </div>
            )}
            {rooms.map((r) => (
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
              <span className="small muted">{activeRoom.description}</span>
            )}
            {active.type === "dm" && (
              <span className="small muted">{dmMembers.length} members</span>
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
                      <div className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>
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
                          <span className="msg-name">{m.username}</span>
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
                      <div className="msg-text">{m.text}</div>
                    </div>
                    <div className="msg-actions">
                      <button className="msg-act-btn" title="Reply" onClick={() => setReplyTo(m)}>
                        ↩
                      </button>
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
          <div className="chat-input-wrap">
            <input
              placeholder={active.type === "room" ? `Message #${active.slug}` : "Message this group"}
              value={input}
              disabled={!!messagesError}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
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

        {/* MEMBER LIST */}
        {showMembers && (
          <div className="card chat-members">
            <div className="chat-members-head">
              Members — {panelMembers.length}
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
                  <div className="member-row" key={m.id}>
                    <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                      {initials(m.username)}
                    </div>
                    <span className="member-name">{m.username}</span>
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
