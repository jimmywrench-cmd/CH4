-- ============================================================
-- CH4 — migration 11
-- Fixes an "integer out of range" crash in the Shorts feed: the
-- stat-override columns added in migration 10 were plain `integer`
-- (4 bytes, max ~2.1 billion), and the trending-sort formula does
-- `likes * 3` — a large enough Edit Stats value overflowed that
-- multiplication and threw a Postgres error, taking the whole feed
-- down with it.
--
-- Widens the offset columns to `bigint` so the arithmetic can't
-- overflow, and the app now also caps what a stats edit is allowed
-- to submit (see app/api/feed/[id]/stats/route.ts and
-- app/api/users/[id]/route.ts) so this can't recur even before this
-- migration is applied to a given database.
--
-- Run this ONCE in the Supabase SQL Editor. Safe to run more than
-- once.
-- ============================================================

alter table public.submissions alter column like_offset type bigint;
alter table public.submissions alter column dislike_offset type bigint;
alter table public.users alter column follower_offset type bigint;

-- Belt and suspenders: clamp any existing offset that's already
-- absurdly large (bigger than a real vote count could ever
-- realistically need to be overridden to) back down to a sane range,
-- in case one was stored before this migration ran.
update public.submissions set like_offset = 1000000000 where like_offset > 1000000000;
update public.submissions set like_offset = -1000000000 where like_offset < -1000000000;
update public.submissions set dislike_offset = 1000000000 where dislike_offset > 1000000000;
update public.submissions set dislike_offset = -1000000000 where dislike_offset < -1000000000;
update public.users set follower_offset = 1000000000 where follower_offset > 1000000000;
update public.users set follower_offset = -1000000000 where follower_offset < -1000000000;
