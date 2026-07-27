-- ============================================================
-- CH4 — migration 10
--   1. Owner/Co-Owner-editable stat overrides: view counts stay a
--      plain column (already directly editable), but likes/dislikes
--      are normally *computed* from real video_likes rows — so we
--      add signed offset columns that get added on top of the real
--      count. Real votes keep working exactly as before; an Owner
--      setting "likes = 500" on a clip with 3 real likes just stores
--      offset = 497. Same idea for a user's follower count.
--   2. Shorts go through a separate, unreviewed upload path: adds
--      `source` ('review' | 'direct') to submissions. 'review' is
--      the existing Submit-a-Clip -> approve/reject -> level-up
--      queue, untouched. 'direct' rows are inserted already
--      `status = 'approved'`, skip the queue entirely, and never
--      touch level/approved_count — they're just a clip someone
--      posted straight from their profile. The Shorts feed now only
--      shows `source = 'direct'` rows, so Shorts and the submission
--      queue are two separate pools of content.
-- Run this ONCE in the Supabase SQL Editor. Safe to run more than
-- once (all steps are guarded).
-- ============================================================

alter table public.submissions add column if not exists like_offset integer not null default 0;
alter table public.submissions add column if not exists dislike_offset integer not null default 0;
alter table public.submissions add column if not exists source text not null default 'review'
  check (source in ('review', 'direct'));

create index if not exists submissions_source_idx on public.submissions (source, status, hidden);

alter table public.users add column if not exists follower_offset integer not null default 0;

-- ------------------------------------------------------------
-- New Status Permissions: edit_video_stats, edit_follower_counts.
-- Owner/Co-Owner only by default — same tier as manage_rank_requirements
-- / edit_status_permissions.
-- ------------------------------------------------------------
insert into public.status_permissions (status, permission, enabled)
select s.status, perm.permission, (s.status in ('Owner', 'Co-Owner'))
from (
  values ('Owner'), ('Co-Owner'), ('Admin'), ('Moderator'), ('Helper'), ('Verified'), ('Member')
) as s(status)
cross join (
  values ('edit_video_stats'), ('edit_follower_counts')
) as perm(permission)
on conflict (status, permission) do nothing;
