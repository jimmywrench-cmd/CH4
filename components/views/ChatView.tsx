"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, isStaff } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import RoleBadge from "../RoleBadge";
import NewGroupModal from "../NewGroupModal";
import NewRoomModal from "../NewRoomModal";

type Active = { type: "room"; slug: string } | { type: "dm"; id: number };

export default function ChatView() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [active, setActive] = useState<Active>({ type: "room", slug: "general" });
  const [dmMembers, setDmMembers] = useState<any[]>([]);

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sidebar lists: rooms load once + refresh when a new one is made.
  // Groups poll gently so new invites show up without a refresh.
  async function loadRooms() {
    const res = await fetch("/api/chat/rooms");
    const data = await res.json();
    setRooms(data.rooms ?? []);
  }
  async function loadGroups() {
    const res = await fetch("/api/dms");
    const data = await res.json();
    setGroups(data.groups ?? []);
  }

  useEffect(() => {
    loadRooms();
    loadGroups();
    const id = setInterval(loadGroups, 10000);
    return () => clearInterval(id);
  }, []);

  // Active conversation's messages.
  async function loadMessages() {
    if (active.type === "room") {
      const res = await fetch(`/api/chat?room=${encodeURIComponent(active.slug)}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } else {
      const res = await fetch(`/api/dms/${active.id}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
      setDmMembers(data.members ?? []);
    }
  }

  useEffect(() => {
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
    if (!text) return;
    setInput("");
    const url = active.type === "room" ? "/api/chat" : `/api/dms/${active.id}`;
    const body =
      active.type === "room"
        ? { text, reply_to_id: replyTo?.id ?? null, room: active.slug }
        : { text, reply_to_id: replyTo?.id ?? null };
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
      const data = await res.json();
      toast(data.error || "Could not send message.");
    }
  }

  async function deleteMsg(id: number) {
    const url =
      active.type === "room" ? `/api/chat/${id}` : `/api/dms/${active.id}?message_id=${id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) loadMessages();
    else toast("Could not delete message.");
  }

  const activeRoom = active.type === "room" ? rooms.find((r) => r.slug === active.slug) : null;
  const activeGroup = active.type === "dm" ? groups.find((g) => g.id === active.id) : null;

  function groupLabel(g: any) {
    if (!g) return "";
    if (g.name) return g.name;
    const names = (g.other_members ?? []).map((m: any) => m.username);
    return names.length ? names.join(", ") : "Empty group";
  }

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Chat
      </div>
      <div className="chat-wrap chat-wrap-v2">
        {/* CONVERSATION LIST */}
        <div className="card chat-sidebar">
          <div className="chat-sidebar-section">
            <div className="chat-sidebar-head">
              <span>Rooms</span>
              {isStaff(user.role) && (
                <button className="icon-btn-sm" title="New room" onClick={() => setShowNewRoom(true)}>
                  +
                </button>
              )}
            </div>
            {rooms.map((r) => (
              <button
                key={r.id}
                className={`chat-convo-item${
                  active.type === "room" && active.slug === r.slug ? " active" : ""
                }`}
                onClick={() => setActive({ type: "room", slug: r.slug })}
              >
                <span className="chat-convo-hash">#</span>
                {r.name}
              </button>
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
                  {groupLabel(g).slice(0, 2).toUpperCase()}
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
          </div>
          <div className="chat-msgs">
            {messages.map((m) => {
              const canDelete = m.user_id === user.id || isStaff(user.role);
              return (
                <div className="msg" key={m.id}>
                  <div className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>
                    {m.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="msg-body">
                    {m.reply_username && (
                      <div className="msg-reply-ref">
                        ↳ replying to {m.reply_username}: {m.reply_text?.slice(0, 60)}
                      </div>
                    )}
                    <div className="msg-top">
                      <span className="msg-name">{m.username}</span>
                      <RoleBadge role={m.role} />
                      <span className="msg-meta">
                        {m.level_label ?? `Level ${m.level}`} ·{" "}
                        {new Date(m.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="msg-text">{m.text}</div>
                  </div>
                  <div className="msg-actions">
                    <button className="msg-act-btn" title="Reply" onClick={() => setReplyTo(m)}>
                      ↩
                    </button>
                    {canDelete && (
                      <button className="msg-act-btn" title="Delete" onClick={() => deleteMsg(m.id)}>
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && (
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={send}>
              Send
            </button>
          </div>
        </div>
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
