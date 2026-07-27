-- ============================================================
-- CH4 — migration 9
-- Follow system: users can follow/unfollow each other and visit
-- one another's profiles. Run this ONCE in the Supabase SQL
-- Editor. Safe to run more than once (all steps are guarded).
-- ============================================================

create table if not exists public.follows (
  follower_id  uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists follows_follower_idx on public.follows (follower_id);

alter table public.follows enable row level security;

drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select using (true);
