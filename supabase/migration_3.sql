-- ============================================================
-- CH4 — migration 3
-- Adds public chat rooms (channels) and private group DMs.
-- Run this ONCE in the Supabase SQL Editor. Safe to run more
-- than once (all steps are guarded).
-- ============================================================

-- ------------------------------------------------------------
-- PUBLIC ROOMS
-- ------------------------------------------------------------
create table if not exists public.chat_rooms (
  id           bigint generated always as identity primary key,
  slug         text not null unique,
  name         text not null,
  description  text not null default '',
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);

-- Seed the original global chat as the "general" room.
insert into public.chat_rooms (slug, name, description)
values ('general', 'General', 'Main community chat')
on conflict (slug) do nothing;

-- Point existing (and future) chat_messages at a room.
alter table public.chat_messages add column if not exists room_id bigint
  references public.chat_rooms(id) on delete cascade;

update public.chat_messages
  set room_id = (select id from public.chat_rooms where slug = 'general')
  where room_id is null;

alter table public.chat_messages alter column room_id set not null;

create index if not exists chat_room_created_idx
  on public.chat_messages (room_id, created_at desc);

-- ------------------------------------------------------------
-- PRIVATE GROUP DMs
-- ------------------------------------------------------------
create table if not exists public.dm_groups (
  id           bigint generated always as identity primary key,
  name         text,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);

create table if not exists public.dm_group_members (
  dm_group_id  bigint not null references public.dm_groups(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (dm_group_id, user_id)
);

create index if not exists dm_group_members_user_idx
  on public.dm_group_members (user_id);

create table if not exists public.dm_messages (
  id           bigint generated always as identity primary key,
  dm_group_id  bigint not null references public.dm_groups(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  text         text not null check (char_length(text) between 1 and 1000),
  reply_to_id  bigint references public.dm_messages(id) on delete set null,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists dm_messages_group_created_idx
  on public.dm_messages (dm_group_id, created_at desc);
