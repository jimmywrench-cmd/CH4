"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, isAdmin, isStaff } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import RoleBadge from "../RoleBadge";

export default function ChatView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch("/api/chat");
    const data = await res.json();
    setMessages(data.messages ?? []);
  }

  useEffect(() => {
    load();
    fetch("/api/leaderboard?tab=active")
      .then((r) => r.json())
      .then((d) => setOnlineUsers((d.users ?? []).slice(0, 12)));
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!user) return null;

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, reply_to_id: replyTo?.id ?? null }),
    });
    if (res.ok) {
      setReplyTo(null);
      load();
    } else {
      const data = await res.json();
      toast(data.error || "Could not send message.");
    }
  }

  async function deleteMsg(id: number) {
    const res = await fetch(`/api/chat/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else toast("Could not delete message.");
  }

  async function togglePin(id: number) {
    const res = await fetch(`/api/chat/${id}/pin`, { method: "POST" });
    if (res.ok) load();
    else toast("Could not pin message.");
  }

  const pinned = messages.find((m) => m.pinned);

  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Community Chat
      </div>
      <div className="chat-wrap">
        <div className="card chat-panel">
          {pinned && (
            <div className="chat-pin">
              📌 <span>{pinned.text}</span>
            </div>
          )}
          <div className="chat-head">
            <span className="online-status" />
            <span className="small" style={{ fontWeight: 600 }}>
              global
            </span>
            <span className="small muted">{onlineUsers.length} recently active</span>
          </div>
          <div className="chat-msgs">
            {messages.map((m) => {
              const canDelete = m.user_id === user.id || isStaff(user.role);
              const canPin = isAdmin(user.role);
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
                        Level {m.level} · {new Date(m.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="msg-text">{m.text}</div>
                  </div>
                  <div className="msg-actions">
                    <button
                      className="msg-act-btn"
                      title="Reply"
                      onClick={() => setReplyTo(m)}
                    >
                      ↩
                    </button>
                    {canPin && (
                      <button
                        className="msg-act-btn"
                        title="Pin"
                        onClick={() => togglePin(m.id)}
                      >
                        📌
                      </button>
                    )}
                    {canDelete && (
                      <button
                        className="msg-act-btn"
                        title="Delete"
                        onClick={() => deleteMsg(m.id)}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          {replyTo && (
            <div className="reply-banner">
              Replying to <b>{replyTo.username}</b>: {replyTo.text.slice(0, 60)}
              <button onClick={() => setReplyTo(null)}>✕</button>
            </div>
          )}
          <div className="chat-input-wrap">
            <button className="icon-btn" title="Emoji">
              🙂
            </button>
            <input
              placeholder="Message #global"
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
        <div className="card online-panel">
          <div className="section-title" style={{ fontSize: 13 }}>
            <span className="accent-bar" />
            Recently Active — {onlineUsers.length}
          </div>
          {onlineUsers.map((u) => (
            <div className="online-item" key={u.id}>
              <span className="online-status" />
              <span className="small">{u.username}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
