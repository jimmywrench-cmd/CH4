-- ============================================================
-- CH4 — migration 4
-- Status Permission System: adds Co-Owner + Helper statuses and
-- a fully DB-backed, toggleable status_permissions matrix.
-- Run this ONCE in the Supabase SQL Editor. Safe to run more
-- than once (all steps are guarded).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Widen the role check constraint to include the two new
--    statuses. Existing rows are untouched.
-- ------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;

alter table public.users add constraint users_role_check
  check (role in ('Member','Verified','Moderator','Admin','Owner','Co-Owner','Helper'));

-- ------------------------------------------------------------
-- 2. The permissions matrix itself: one row per (status, permission)
--    pair. `enabled` is the on/off toggle the Owner/Co-Owner control
--    from the Status Permissions page.
-- ------------------------------------------------------------
create table if not exists public.status_permissions (
  status      text not null,
  permission  text not null,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (status, permission)
);

create index if not exists status_permissions_status_idx
  on public.status_permissions (status);

-- ------------------------------------------------------------
-- 3. Seed defaults for every (status, permission) pair, matching
--    lib/permissions-shared.ts::DEFAULT_MATRIX exactly. Only
--    inserts rows that don't already exist, so re-running this
--    migration never clobbers permissions an Owner has already
--    customized.
-- ------------------------------------------------------------
insert into public.status_permissions (status, permission, enabled)
select s.status, p.permission, p.default_enabled
from (values
  ('Owner'), ('Co-Owner'), ('Admin'), ('Moderator'), ('Helper'), ('Verified'), ('Member')
) as s(status)
cross join (values
  ('manage_announcements'),
  ('create_announcements'),
  ('manage_chat'),
  ('delete_chat_messages'),
  ('mute_users'),
  ('suspend_users'),
  ('ban_users'),
  ('unban_users'),
  ('delete_users'),
  ('manage_reports'),
  ('accept_videos'),
  ('deny_videos'),
  ('edit_users'),
  ('change_usernames'),
  ('change_profile_pictures'),
  ('change_user_levels'),
  ('change_user_ranks'),
  ('change_user_statuses'),
  ('create_custom_roles'),
  ('edit_custom_roles'),
  ('delete_custom_roles'),
  ('assign_custom_roles'),
  ('manage_rooms'),
  ('create_chat_rooms'),
  ('delete_chat_rooms'),
  ('manage_website_settings'),
  ('manage_rank_requirements'),
  ('edit_status_permissions'),
  ('view_analytics'),
  ('export_data'),
  ('access_beta_tools')
) as perm(permission)
cross join lateral (
  select case
    -- Owner / Co-Owner: everything on by default.
    when s.status in ('Owner', 'Co-Owner') then true

    -- Admin: everything except these four.
    when s.status = 'Admin' and perm.permission in (
      'delete_users', 'change_user_statuses', 'edit_status_permissions', 'manage_rank_requirements'
    ) then false
    when s.status = 'Admin' then true

    -- Moderator: Admin's restrictions, plus ban + all custom-role
    -- management + level/rank changes.
    when s.status = 'Moderator' and perm.permission in (
      'delete_users', 'change_user_statuses', 'edit_status_permissions', 'manage_rank_requirements',
      'ban_users', 'create_custom_roles', 'edit_custom_roles', 'delete_custom_roles',
      'assign_custom_roles', 'change_user_levels', 'change_user_ranks'
    ) then false
    when s.status = 'Moderator' then true

    -- Helper: member baseline plus suspend + video review.
    when s.status = 'Helper' and perm.permission in ('suspend_users', 'accept_videos', 'deny_videos')
      then true
    when s.status = 'Helper' then false

    -- Verified / Member: baseline, everything off.
    else false
  end as default_enabled
) p
on conflict (status, permission) do nothing;

-- ------------------------------------------------------------
-- 4. Guard rail: Owner's row can never be disabled, enforced at
--    the database level as a second line of defense behind the
--    application-level check in lib/permissions.ts.
-- ------------------------------------------------------------
create or replace function public.enforce_owner_permissions()
returns trigger as $$
begin
  if new.status = 'Owner' and new.enabled = false then
    new.enabled := true;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists status_permissions_owner_guard on public.status_permissions;
create trigger status_permissions_owner_guard
  before insert or update on public.status_permissions
  for each row execute function public.enforce_owner_permissions();
