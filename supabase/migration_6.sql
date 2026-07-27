-- ============================================================
-- CH4 — migration 6: Shorts-style video feed
-- Run this ONCE in the Supabase SQL Editor. Safe to run more
-- than once (all steps are guarded).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Moderation / discovery columns on submissions.
-- ------------------------------------------------------------
alter table public.submissions add column if not exists featured boolean not null default false;
alter table public.submissions add column if not exists pinned boolean not null default false;
alter table public.submissions add column if not exists hidden boolean not null default false;
alter table public.submissions add column if not exists comments_disabled boolean not null default false;
alter table public.submissions add column if not exists tags text[] not null default '{}';
alter table public.submissions add column if not exists view_count bigint not null default 0;
alter table public.submissions add column if not exists total_watch_seconds numeric not null default 0;
alter table public.submissions add column if not exists share_count bigint not null default 0;

create index if not exists submissions_feed_idx
  on public.submissions (status, hidden, pinned desc, created_at desc);

-- ------------------------------------------------------------
-- 2. Likes / dislikes. One row per (submission, user); value is
--    1 for like, -1 for dislike — toggling is just an upsert or
--    delete, so a user can never hold both at once.
-- ------------------------------------------------------------
create table if not exists public.video_likes (
  submission_id bigint not null references public.submissions(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  value         smallint not null check (value in (1, -1)),
  created_at    timestamptz not null default now(),
  primary key (submission_id, user_id)
);

create index if not exists video_likes_submission_idx on public.video_likes (submission_id, value);

-- ------------------------------------------------------------
-- 3. Comments — same shape as chat_messages (reply threading,
--    soft delete) so the UI patterns line up.
-- ------------------------------------------------------------
create table if not exists public.video_comments (
  id            bigint generated always as identity primary key,
  submission_id bigint not null references public.submissions(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  text          text not null check (char_length(text) between 1 and 500),
  reply_to_id   bigint references public.video_comments(id) on delete set null,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists video_comments_submission_idx
  on public.video_comments (submission_id, created_at desc);

create table if not exists public.video_comment_likes (
  comment_id  bigint not null references public.video_comments(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ------------------------------------------------------------
-- 4. Reports.
-- ------------------------------------------------------------
create table if not exists public.video_reports (
  id            bigint generated always as identity primary key,
  submission_id bigint not null references public.submissions(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  reason        text not null check (char_length(reason) between 1 and 300),
  resolved      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists video_reports_submission_idx on public.video_reports (submission_id);
create index if not exists video_reports_unresolved_idx on public.video_reports (resolved, created_at desc);

-- ------------------------------------------------------------
-- 5. Per-viewing-session watch data, for the analytics panel
--    (avg watch time / avg watch %). Not shown raw to users.
-- ------------------------------------------------------------
create table if not exists public.video_views (
  id             bigint generated always as identity primary key,
  submission_id  bigint not null references public.submissions(id) on delete cascade,
  user_id        uuid references public.users(id) on delete set null,
  watch_seconds  numeric not null default 0,
  video_duration numeric,
  created_at     timestamptz not null default now()
);

create index if not exists video_views_submission_idx on public.video_views (submission_id);

-- ------------------------------------------------------------
-- 6. RLS — same pattern as the rest of the app: public read where
--    it's safe, no anon write policies (all writes go through
--    server routes on the service role).
-- ------------------------------------------------------------
alter table public.video_likes enable row level security;
alter table public.video_comments enable row level security;
alter table public.video_comment_likes enable row level security;
alter table public.video_reports enable row level security;
alter table public.video_views enable row level security;

drop policy if exists video_likes_read on public.video_likes;
create policy video_likes_read on public.video_likes for select using (true);

drop policy if exists video_comments_read on public.video_comments;
create policy video_comments_read on public.video_comments for select using (not deleted);

drop policy if exists video_comment_likes_read on public.video_comment_likes;
create policy video_comment_likes_read on public.video_comment_likes for select using (true);

-- video_reports and video_views intentionally have no public read
-- policy — reports and raw watch sessions are staff/analytics-only,
-- served through the API's requirePermission checks.

-- ------------------------------------------------------------
-- 7. New Status Permission: "manage_shorts" — feature/pin/hide/
--    remove a video, delete comments, disable comments on a video.
--    (Viewing reports and analytics reuse the existing
--    manage_reports / view_analytics permissions.)
-- ------------------------------------------------------------
insert into public.status_permissions (status, permission, enabled)
select s.status, 'manage_shorts', case
  when s.status in ('Owner', 'Co-Owner', 'Admin', 'Moderator') then true
  else false
end
from (values ('Owner'), ('Co-Owner'), ('Admin'), ('Moderator'), ('Helper'), ('Verified'), ('Member')) as s(status)
on conflict (status, permission) do nothing;
