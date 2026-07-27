"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/client/AuthContext";
import { useToast } from "../Toast";
import { Rank, rankForLevel, displayLevel, displayRankName } from "@/lib/ranks";
import RoleBadge from "../RoleBadge";
import CustomRoleBadge, { CustomRole } from "../CustomRoleBadge";

type Video = {
  id: number;
  title: string;
  description: string;
  video_path: string | null;
  video_url?: string;
  tags: string[];
  featured: boolean;
  pinned: boolean;
  comments_disabled: boolean;
  view_count: number;
  share_count: number;
  created_at: string;
  user_id: string;
  username: string;
  role: string;
  level: number;
  level_label: string | null;
  custom_roles: CustomRole[];
  likes: number;
  dislikes: number;
  comment_count: number;
  my_vote: 1 | -1 | null;
};

type Comment = {
  id: number;
  text: string;
  reply_to_id: number | null;
  created_at: string;
  user_id: string;
  username: string;
  role: string;
  level: number;
  reply_username: string | null;
  reply_text: string | null;
  like_count: number;
  liked_by_me: boolean;
};

const SORTS = [
  { key: "trending", label: "Trending" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "liked", label: "Most Liked" },
  { key: "viewed", label: "Most Viewed" },
];

function volumePref() {
  if (typeof window === "undefined") return { muted: false, volume: 1 };
  try {
    const raw = localStorage.getItem("ch4_shorts_av");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { muted: false, volume: 1 };
}
function saveVolumePref(muted: boolean, volume: number) {
  try {
    localStorage.setItem("ch4_shorts_av", JSON.stringify({ muted, volume }));
  } catch {}
}
function savedPosition(id: number) {
  if (typeof window === "undefined") return 0;
  try {
    return Number(localStorage.getItem(`ch4_shorts_pos_${id}`)) || 0;
  } catch {
    return 0;
  }
}
function savePosition(id: number, t: number) {
  try {
    localStorage.setItem(`ch4_shorts_pos_${id}`, String(t));
  } catch {}
}

export default function ShortsView({ ranks }: { ranks: Rank[] }) {
  const { user, can } = useAuth();
  const { toast } = useToast();

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState(0);
  const [sort, setSort] = useState("trending");
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const watchStart = useRef<number | null>(null);
  const viewLogged = useRef<Set<number>>(new Set());

  const [av, setAv] = useState(volumePref());

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ sort });
      if (q) params.set("q", q);
      if (tag) params.set("tag", tag);
      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) {
        setLoadError(true);
        setVideos([]);
        return;
      }
      const data = await res.json();
      setVideos(data.videos ?? []);
      setActive(0);
    } catch {
      setLoadError(true);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const current = videos[active];

  // ---- autoplay / pause active video, log view start ----
  useEffect(() => {
    videos.forEach((v, i) => {
      const el = videoRefs.current[v.id];
      if (!el) return;
      if (i === active) {
        const pos = savedPosition(v.id);
        if (pos > 0 && pos < (el.duration || Infinity) - 2) el.currentTime = pos;
        el.muted = av.muted;
        el.volume = av.volume;
        el.play().catch(() => {});
        watchStart.current = Date.now();
        if (!viewLogged.current.has(v.id)) {
          viewLogged.current.add(v.id);
          fetch(`/api/feed/${v.id}/view`, { method: "POST" });
        }
      } else {
        if (!el.paused) {
          const watched = watchStart.current ? (Date.now() - watchStart.current) / 1000 : 0;
          if (watched > 1) {
            fetch(`/api/feed/${v.id}/view`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ seconds: Math.min(watched, el.duration || watched), duration: el.duration || null }),
            });
          }
        }
        el.pause();
        savePosition(v.id, el.currentTime);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, videos]);

  // ---- scroll / wheel navigation ----
  const wheelLock = useRef(false);
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (wheelLock.current) return;
      if (Math.abs(e.deltaY) < 20) return;
      wheelLock.current = true;
      setTimeout(() => (wheelLock.current = false), 450);
      if (e.deltaY > 0) setActive((a) => Math.min(videos.length - 1, a + 1));
      else setActive((a) => Math.max(0, a - 1));
    },
    [videos.length]
  );

  // touch swipe
  const touchStartY = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 60) {
      if (dy > 0) setActive((a) => Math.min(videos.length - 1, a + 1));
      else setActive((a) => Math.max(0, a - 1));
    }
    touchStartY.current = null;
  }

  // keyboard shortcuts (desktop)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      const el = current && videoRefs.current[current.id];
      if (e.key === "ArrowDown") setActive((a) => Math.min(videos.length - 1, a + 1));
      else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
      else if (e.key === " ") {
        e.preventDefault();
        if (el) el.paused ? el.play() : el.pause();
      } else if (e.key === "m") toggleMute();
      else if (e.key === "ArrowRight" && el) el.currentTime += 5;
      else if (e.key === "ArrowLeft" && el) el.currentTime = Math.max(0, el.currentTime - 5);
      else if (e.key === "f") toggleFullscreen();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, videos.length]);

  function toggleMute() {
    setAv((prev: any) => {
      const next = { ...prev, muted: !prev.muted };
      saveVolumePref(next.muted, next.volume);
      Object.values(videoRefs.current).forEach((el) => el && (el.muted = next.muted));
      return next;
    });
  }
  function setVolume(v: number) {
    setAv((prev: any) => {
      const next = { muted: v === 0, volume: v };
      saveVolumePref(next.muted, next.volume);
      Object.values(videoRefs.current).forEach((el) => {
        if (el) {
          el.volume = v;
          el.muted = v === 0;
        }
      });
      return next;
    });
  }
  function toggleFullscreen() {
    const wrap = containerRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.requestFullscreen?.();
  }
  function togglePlay(v: Video) {
    const el = videoRefs.current[v.id];
    if (!el) return;
    el.paused ? el.play() : el.pause();
  }

  function requireAuth() {
    if (!user) {
      toast("Log in to react to clips.");
      return false;
    }
    return true;
  }

  // `force` skips the toggle-off behavior — used for double-tap-to-like,
  // which should only ever add a like, never remove one.
  async function vote(v: Video, value: 1 | -1, force = false) {
    if (!requireAuth()) return;
    if (force && v.my_vote === value) return;

    const prev = { my_vote: v.my_vote, likes: v.likes, dislikes: v.dislikes };
    setVideos((list) =>
      list.map((x) => {
        if (x.id !== v.id) return x;
        const removing = !force && x.my_vote === value;
        let likes = x.likes;
        let dislikes = x.dislikes;
        // undo the previous vote, if any
        if (x.my_vote === 1) likes--;
        if (x.my_vote === -1) dislikes--;
        // apply the new one, unless we're just un-voting
        if (!removing) {
          if (value === 1) likes++;
          else dislikes++;
        }
        return { ...x, likes, dislikes, my_vote: removing ? null : value };
      })
    );
    try {
      const res = await fetch(`/api/feed/${v.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // roll back the optimistic update if the request failed
      setVideos((list) => list.map((x) => (x.id === v.id ? { ...x, ...prev } : x)));
      toast("Could not save your reaction.");
    }
  }

  async function share(v: Video) {
    const url = `${window.location.origin}/?video=${v.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch {
      toast(url);
    }
    fetch(`/api/feed/${v.id}/share`, { method: "POST" });
  }

  async function report(v: Video) {
    if (!requireAuth()) return;
    const reason = window.prompt("What's wrong with this clip?");
    if (!reason || !reason.trim()) return;
    const res = await fetch(`/api/feed/${v.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    if (res.ok) toast("Report submitted.");
    else toast("Could not submit report.");
  }

  async function moderate(v: Video, action: string) {
    const res = await fetch(`/api/feed/${v.id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Could not update video.");
    if (data.removed) {
      setVideos((list) => list.filter((x) => x.id !== v.id));
      toast("Video removed.");
    } else {
      setVideos((list) => list.map((x) => (x.id === v.id ? { ...x, ...data.video } : x)));
      toast("Updated.");
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <span className="spinner" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div>
        <ShortsSearchBar q={q} tag={tag} setQ={setQ} setTag={setTag} onSearch={load} show={showSearch} setShow={setShowSearch} sort={sort} setSort={setSort} />
        <div className="empty-state">
          {loadError ? (
            <>
              Couldn't load clips.{" "}
              <button className="btn btn-ghost btn-sm" onClick={load}>
                Retry
              </button>
            </>
          ) : (
            "No clips match yet — approved submissions show up here."
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="shorts-page">
      <ShortsSearchBar
        q={q}
        tag={tag}
        setQ={setQ}
        setTag={setTag}
        onSearch={load}
        show={showSearch}
        setShow={setShowSearch}
        sort={sort}
        setSort={setSort}
      />

      <div
        className="shorts-feed"
        ref={containerRef}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {videos.map((v, i) => (
          <ShortsCard
            key={v.id}
            video={v}
            isActive={i === active}
            distance={Math.abs(i - active)}
            offset={i - active}
            ranks={ranks}
            av={av}
            registerRef={(el) => (videoRefs.current[v.id] = el)}
            onTogglePlay={() => togglePlay(v)}
            onEnded={() => setActive((a) => Math.min(videos.length - 1, a + 1))}
            onVote={(val) => vote(v, val)}
            onLike={() => vote(v, 1, true)}
            onShare={() => share(v)}
            onReport={() => report(v)}
            onOpenComments={() => {
              if (!user) return toast("Log in to view and post comments.");
              setCommentsOpen(true);
            }}
            onToggleMute={toggleMute}
            onSetVolume={setVolume}
            onFullscreen={toggleFullscreen}
            canModerate={can("manage_shorts")}
            onModerate={(action) => moderate(v, action)}
          />
        ))}
      </div>

      {current && (
        <div className="shorts-nav-hint">
          {active + 1} / {videos.length}
        </div>
      )}

      {current && commentsOpen && (
        <CommentsPanel video={current} onClose={() => setCommentsOpen(false)} onCountChange={(n) =>
          setVideos((list) => list.map((x) => (x.id === current.id ? { ...x, comment_count: n } : x)))
        } />
      )}
    </div>
  );
}

function ShortsSearchBar({
  q,
  tag,
  setQ,
  setTag,
  onSearch,
  show,
  setShow,
  sort,
  setSort,
}: {
  q: string;
  tag: string;
  setQ: (v: string) => void;
  setTag: (v: string) => void;
  onSearch: () => void;
  show: boolean;
  setShow: (v: boolean) => void;
  sort: string;
  setSort: (v: string) => void;
}) {
  return (
    <div className="shorts-topbar">
      <div className="shorts-sorts">
        {SORTS.map((s) => (
          <button
            key={s.key}
            className={`shorts-sort-chip${sort === s.key ? " active" : ""}`}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button className="icon-btn" onClick={() => setShow(!show)} title="Search & filter">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
      </button>
      {show && (
        <div className="shorts-search-panel">
          <input
            placeholder="Search by title or username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
          <input
            placeholder="Filter by tag…"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
          <button className="btn btn-primary btn-sm" onClick={onSearch}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

function ShortsCard({
  video,
  isActive,
  distance,
  offset,
  ranks,
  av,
  registerRef,
  onTogglePlay,
  onEnded,
  onVote,
  onLike,
  onShare,
  onReport,
  onOpenComments,
  onToggleMute,
  onSetVolume,
  onFullscreen,
  canModerate,
  onModerate,
}: {
  video: Video;
  isActive: boolean;
  distance: number;
  offset: number;
  ranks: Rank[];
  av: { muted: boolean; volume: number };
  registerRef: (el: HTMLVideoElement | null) => void;
  onTogglePlay: () => void;
  onEnded: () => void;
  onVote: (v: 1 | -1) => void;
  onLike: () => void;
  onShare: () => void;
  onReport: () => void;
  onOpenComments: () => void;
  onToggleMute: () => void;
  onSetVolume: (v: number) => void;
  onFullscreen: () => void;
  canModerate: boolean;
  onModerate: (action: string) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const lastClick = useRef(0);
  const localRef = useRef<HTMLVideoElement | null>(null);

  function setRefs(el: HTMLVideoElement | null) {
    localRef.current = el;
    registerRef(el);
  }

  // Only render <video> for cards near the active one — preloads
  // the next couple without keeping every clip decoded in memory.
  if (distance > 2) {
    return (
      <div
        className="shorts-card shorts-card-placeholder"
        style={{ transform: `translateY(${offset * 100}%)`, opacity: 0, pointerEvents: "none" }}
      />
    );
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastClick.current < 300) {
      setLikeBurst(true);
      setTimeout(() => setLikeBurst(false), 700);
      onLike();
    } else {
      onTogglePlay();
    }
    lastClick.current = now;
  }

  return (
    <div
      className={`shorts-card${isActive ? " is-active" : ""}`}
      style={{ transform: `translateY(${offset * 100}%)` }}
    >
      <video
        ref={setRefs}
        src={video.video_url}
        className="shorts-video"
        loop={false}
        playsInline
        preload={distance <= 1 ? "auto" : "metadata"}
        muted={av.muted}
        onClick={handleTap}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setProgress((el.currentTime / el.duration) * 100);
        }}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={onEnded}
      />

      {likeBurst && <div className="shorts-like-burst">❤️</div>}
      {paused && isActive && <div className="shorts-play-overlay">▶</div>}

      <div className="shorts-progress-track">
        <div className="shorts-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {(video.pinned || video.featured) && (
        <div className="shorts-badges-top">
          {video.pinned && <span className="pill">📌 Pinned</span>}
          {video.featured && <span className="pill">⭐ Featured</span>}
        </div>
      )}

      {/* right action bar */}
      <div className="shorts-actions">
        <button className={`shorts-act${video.my_vote === 1 ? " active" : ""}`} onClick={() => onVote(1)}>
          <span className="shorts-act-icon">👍</span>
          <span className="shorts-act-count">{video.likes}</span>
        </button>
        <button className={`shorts-act${video.my_vote === -1 ? " active" : ""}`} onClick={() => onVote(-1)}>
          <span className="shorts-act-icon">👎</span>
          <span className="shorts-act-count">{video.dislikes}</span>
        </button>
        <button className="shorts-act" onClick={onOpenComments}>
          <span className="shorts-act-icon">💬</span>
          <span className="shorts-act-count">{video.comment_count}</span>
        </button>
        <button className="shorts-act" onClick={onShare}>
          <span className="shorts-act-icon">🔗</span>
          <span className="shorts-act-count">{video.share_count}</span>
        </button>
        <button className="shorts-act" onClick={onReport}>
          <span className="shorts-act-icon">🚩</span>
        </button>
        <button
          className="shorts-act"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}/?video=${video.id}`);
          }}
        >
          <span className="shorts-act-icon">📋</span>
        </button>
        {canModerate && (
          <div style={{ position: "relative" }}>
            <button className="shorts-act" onClick={() => setModOpen((o) => !o)}>
              <span className="shorts-act-icon">⚙️</span>
            </button>
            {modOpen && (
              <div className="shorts-mod-menu">
                <button onClick={() => onModerate(video.featured ? "unfeature" : "feature")}>
                  {video.featured ? "Unfeature" : "Feature"}
                </button>
                <button onClick={() => onModerate(video.pinned ? "unpin" : "pin")}>
                  {video.pinned ? "Unpin" : "Pin"}
                </button>
                <button onClick={() => onModerate("hide")}>Hide</button>
                <button
                  onClick={() =>
                    onModerate(video.comments_disabled ? "enable_comments" : "disable_comments")
                  }
                >
                  {video.comments_disabled ? "Enable comments" : "Disable comments"}
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm("Permanently remove this video?")) onModerate("remove");
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* bottom-left info */}
      <div className="shorts-info">
        <div className="flex gap8 mb8" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <div className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
            {video.username.slice(0, 2).toUpperCase()}
          </div>
          <b>{video.username}</b>
          <RoleBadge role={video.role} />
          {(video.custom_roles ?? []).map((r) => (
            <CustomRoleBadge key={r.id} role={r} size="sm" />
          ))}
          <span className="pill">
            {displayLevel(video)} · {displayRankName(ranks, video)}
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{video.title}</div>
        {video.description && (
          <div className="small muted" style={{ marginTop: 2, maxWidth: 420 }}>
            {video.description}
          </div>
        )}
        <div className="small muted mono" style={{ marginTop: 6 }}>
          {new Date(video.created_at).toLocaleDateString()} · {video.view_count} views
        </div>
      </div>

      {/* desktop controls */}
      <div className="shorts-controls">
        <button className="icon-btn" onClick={onTogglePlay}>
          {paused ? "▶" : "⏸"}
        </button>
        <button className="icon-btn" onClick={onToggleMute}>
          {av.muted || av.volume === 0 ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={av.muted ? 0 : av.volume}
          onChange={(e) => onSetVolume(Number(e.target.value))}
          className="shorts-volume"
        />
        <button
          className="icon-btn"
          onClick={() => {
            if (localRef.current) localRef.current.currentTime = Math.max(0, localRef.current.currentTime - 5);
          }}
          title="Skip back 5s (← key)"
        >
          ⏪
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            if (localRef.current) localRef.current.currentTime += 5;
          }}
          title="Skip forward 5s (→ key)"
        >
          ⏩
        </button>
        <button className="icon-btn" onClick={onFullscreen}>
          ⛶
        </button>
      </div>
    </div>
  );
}

function CommentsPanel({
  video,
  onClose,
  onCountChange,
}: {
  video: Video;
  onClose: () => void;
  onCountChange: (n: number) => void;
}) {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [sort, setSort] = useState("top");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/feed/${video.id}/comments?sort=${sort}`);
      if (!res.ok) {
        setLoadError(true);
        setComments([]);
        return;
      }
      const data = await res.json();
      setComments(data.comments ?? []);
      onCountChange((data.comments ?? []).length);
    } catch {
      setLoadError(true);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  if (!user) return null;

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    const res = await fetch(`/api/feed/${video.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, reply_to_id: replyTo?.id ?? null }),
    });
    if (res.ok) {
      setReplyTo(null);
      load();
    } else {
      const data = await res.json();
      toast(data.error || "Could not post comment.");
    }
  }

  async function del(c: Comment) {
    const res = await fetch(`/api/feed/${video.id}/comments/${c.id}`, { method: "DELETE" });
    if (res.ok) load();
    else toast("Could not delete comment.");
  }

  async function likeComment(c: Comment) {
    setComments((list) =>
      list.map((x) =>
        x.id === c.id
          ? { ...x, liked_by_me: !x.liked_by_me, like_count: x.like_count + (x.liked_by_me ? -1 : 1) }
          : x
      )
    );
    await fetch(`/api/feed/${video.id}/comments/${c.id}/like`, { method: "POST" });
  }

  return (
    <div className="shorts-comments-overlay" onClick={onClose}>
      <div className="shorts-comments-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shorts-comments-head">
          <b>{comments.length} Comments</b>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="tabs" style={{ padding: "0 14px" }}>
          {["top", "newest", "oldest"].map((s) => (
            <button
              key={s}
              className={`tab${sort === s ? " active" : ""}`}
              onClick={() => setSort(s)}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="shorts-comments-list">
          {loading ? (
            <div className="empty-state small">Loading…</div>
          ) : loadError ? (
            <div className="empty-state small">Couldn't load comments. Try again.</div>
          ) : video.comments_disabled ? (
            <div className="empty-state small">Comments are disabled on this video.</div>
          ) : comments.length === 0 ? (
            <div className="empty-state small">No comments yet — be the first.</div>
          ) : (
            comments.map((c) => (
              <div className="msg" key={c.id}>
                <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                  {c.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="msg-body">
                  {c.reply_username && (
                    <div className="msg-reply-ref">
                      ↳ replying to {c.reply_username}: {c.reply_text?.slice(0, 50)}
                    </div>
                  )}
                  <div className="msg-top">
                    <span className="msg-name">{c.username}</span>
                    <RoleBadge role={c.role} />
                    <span className="msg-meta">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div className="msg-text">{c.text}</div>
                  <div className="flex gap12" style={{ marginTop: 4 }}>
                    <button
                      className="small muted"
                      onClick={() => likeComment(c)}
                      style={{ color: c.liked_by_me ? "var(--purple2)" : undefined }}
                    >
                      👍 {c.like_count}
                    </button>
                    <button className="small muted" onClick={() => setReplyTo(c)}>
                      Reply
                    </button>
                    {(c.user_id === user.id || can("manage_shorts")) && (
                      <button className="small muted" onClick={() => del(c)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {!video.comments_disabled && (
          <>
            {replyTo && (
              <div className="reply-banner">
                Replying to <b>{replyTo.username}</b>
                <button onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            <div className="chat-input-wrap">
              <input
                placeholder="Add a comment…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button className="btn btn-primary btn-sm" onClick={send}>
                Post
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
