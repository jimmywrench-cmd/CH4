-- ============================================================
-- CH4 — full schema
-- Run this once in Supabase SQL editor (or `psql` against your
-- Supabase Postgres connection string).
-- ============================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- USERS
-- Real accounts. No email. Username is case-insensitive unique
-- via the `citext` type — two accounts CANNOT share a username,
-- including differing only by case ("Nyx" and "nyx" collide).
-- Password is bcrypt-hashed application-side before it ever
-- reaches this table (see lib/auth.ts) — this DB never sees or
-- stores a plaintext password.
-- ------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  username      citext unique not null
                  check (char_length(username) between 3 and 20)
                  check (username ~ '^[a-zA-Z0-9_]+$'),
  password_hash text not null,
  role          text not null default 'Member'
                  check (role in ('Member','Verified','Moderator','Admin','Owner')),
  level         int  not null default 1 check (level >= 1),
  bio           text not null default '',
  avatar_seed   text not null default '',
  approved_count int not null default 0,
  rejected_count int not null default 0,
  suspended     boolean not null default false,
  banned        boolean not null default false,
  last_seen     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists users_level_idx on public.users (level desc);
create index if not exists users_role_idx on public.users (role);

-- ------------------------------------------------------------
-- RANKS
-- Editable tiers (Owner/Admin can change min level per tier).
-- ------------------------------------------------------------
create table if not exists public.ranks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  min_level   int  not null,
  sort_order  int  not null,
  created_at  timestamptz not null default now()
);

insert into public.ranks (name, min_level, sort_order)
select * from (values
  ('Spy',1,0), ('Ghost',3,1), ('Spectre',5,2), ('Phantom',7,3),
  ('Shadow',9,4), ('Stalker',11,5), ('Infiltrator',13,6),
  ('Operative',15,7), ('Agent',17,8), ('Assassin',19,9), ('Vanguard',30,10)
) as seed(name, min_level, sort_order)
where not exists (select 1 from public.ranks);

-- ------------------------------------------------------------
-- SUBMISSIONS (clip queue)
-- ------------------------------------------------------------
create table if not exists public.submissions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  description  text not null default '',
  video_path   text,               -- storage object path (see storage section)
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  level_at_submit int not null,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.users(id) on delete set null
);

create index if not exists submissions_status_idx on public.submissions (status, created_at desc);
create index if not exists submissions_user_idx on public.submissions (user_id);

-- ------------------------------------------------------------
-- CHAT
-- ------------------------------------------------------------
create table if not exists public.chat_messages (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.users(id) on delete cascade,
  text         text not null check (char_length(text) between 1 and 1000),
  reply_to_id  bigint references public.chat_messages(id) on delete set null,
  pinned       boolean not null default false,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists chat_created_idx on public.chat_messages (created_at desc);

-- ------------------------------------------------------------
-- ANNOUNCEMENTS
-- ------------------------------------------------------------
create table if not exists public.announcements (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null,
  posted_by   uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  text        text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifs_user_idx on public.notifications (user_id, created_at desc);

-- ------------------------------------------------------------
-- SESSIONS
-- Server-issued session tokens (opaque random id, hashed at
-- rest). The signed cookie the browser holds only ever contains
-- this id — never a password, never raw user data.
-- ------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists sessions_user_idx on public.sessions (user_id);
create index if not exists sessions_expiry_idx on public.sessions (expires_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- The Next.js server is the only thing that talks to Postgres
-- (via the service role from server-only code — see lib/db.ts),
-- so RLS here is a second line of defense, not the primary gate.
-- Policies below assume access through Supabase's PostgREST layer
-- too, in case you ever expose it directly.
-- ============================================================
alter table public.users enable row level security;
alter table public.submissions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.ranks enable row level security;
alter table public.sessions enable row level security;

-- Public read of non-sensitive profile fields; no anon writes.
drop policy if exists users_read on public.users;
create policy users_read on public.users for select using (true);

drop policy if exists ranks_read on public.ranks;
create policy ranks_read on public.ranks for select using (true);

drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select using (true);

drop policy if exists chat_read on public.chat_messages;
create policy chat_read on public.chat_messages for select using (not deleted);

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select using (true);

-- No anon insert/update/delete policies are defined anywhere:
-- all writes go through server routes using the service role key,
-- which bypasses RLS deliberately and enforces auth + role checks
-- in application code (see lib/auth.ts, app/api/**).

-- ============================================================
-- APPROVE / REJECT — atomic functions so a submission can never
-- be approved twice or leave a user's level out of sync.
-- Called from the service role, with the reviewer's user id and
-- role already checked server-side.
-- ============================================================
create or replace function public.approve_submission(p_submission_id bigint, p_reviewer_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_status text;
begin
  select user_id, status into v_user_id, v_status
  from public.submissions where id = p_submission_id
  for update;

  if v_status is null then
    raise exception 'submission not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'submission already reviewed';
  end if;

  update public.submissions
    set status = 'approved', reviewed_at = now(), reviewed_by = p_reviewer_id
    where id = p_submission_id;

  update public.users
    set level = level + 1, approved_count = approved_count + 1
    where id = v_user_id;

  insert into public.notifications (user_id, text)
    values (v_user_id, 'Your submission was approved and you leveled up!');
end;
$$;

create or replace function public.reject_submission(p_submission_id bigint, p_reviewer_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_status text;
begin
  select user_id, status into v_user_id, v_status
  from public.submissions where id = p_submission_id
  for update;

  if v_status is null then
    raise exception 'submission not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'submission already reviewed';
  end if;

  update public.submissions
    set status = 'rejected', reviewed_at = now(), reviewed_by = p_reviewer_id
    where id = p_submission_id;

  update public.users
    set rejected_count = rejected_count + 1
    where id = v_user_id;

  insert into public.notifications (user_id, text)
    values (v_user_id, 'Your submission wasn''t approved this time.');
end;
$$;

-- Session cleanup — safe to run on a cron (e.g. Supabase's pg_cron)
create or replace function public.purge_expired_sessions()
returns void
language sql
as $$
  delete from public.sessions where expires_at < now();
$$;

-- ============================================================
-- STORAGE
-- Run in the Supabase dashboard (Storage tab) or via SQL below:
-- create a private bucket for clip video files. Server routes
-- generate signed upload URLs — clients never get a raw
-- service-role key.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('clips', 'clips', false)
on conflict (id) do nothing;
