-- ============================================================
-- CH4 — migration 8
-- Discord-style server upgrades:
--   1. Channel categories (rooms grouped under a header, like
--      Discord's "TEXT CHANNELS" sections).
--   2. Emoji reactions on room messages.
--   3. Editable room messages ("(edited)" flag, Discord-style).
-- Run this ONCE in the Supabase SQL Editor. Safe to run more
-- than once (all steps are guarded).
-- ============================================================

-- ------------------------------------------------------------
-- CHANNEL CATEGORIES
-- ------------------------------------------------------------
alter table public.chat_rooms
  add column if not exists category text not null default 'Text Channels';

update public.chat_rooms set category = 'Text Channels' where category is null or category = '';

-- ------------------------------------------------------------
-- MESSAGE EDITING
-- ------------------------------------------------------------
alter table public.chat_messages
  add column if not exists edited_at timestamptz;

-- ------------------------------------------------------------
-- EMOJI REACTIONS (room messages)
-- ------------------------------------------------------------
create table if not exists public.chat_reactions (
  id           bigint generated always as identity primary key,
  message_id   bigint not null references public.chat_messages(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  emoji        text not null check (char_length(emoji) between 1 and 8),
  created_at   timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists chat_reactions_message_idx
  on public.chat_reactions (message_id);

alter table public.chat_reactions enable row level security;

drop policy if exists chat_reactions_read on public.chat_reactions;
create policy chat_reactions_read on public.chat_reactions for select using (true);
