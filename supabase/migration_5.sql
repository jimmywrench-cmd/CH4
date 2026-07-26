-- ============================================================
-- CH4 — migration 5: Custom Role system
-- Safe to run more than once.
--
-- Adds a "Role" concept distinct from the existing "Status"
-- (users.role — Owner/Admin/etc, see permissions-shared.ts) and
-- "Rank" (public.ranks — level progression). Custom Roles are
-- cosmetic/informational labels staff create and assign; a user
-- can hold any number of them at once.
-- ============================================================

create table if not exists public.custom_roles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 40),
  color         text not null default '#e6e6e6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  bold          boolean not null default false,
  italic        boolean not null default false,
  underline     boolean not null default false,
  strikethrough boolean not null default false,
  icon          text check (icon is null or char_length(icon) <= 8),
  sort_order    int not null default 0,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists custom_roles_sort_idx on public.custom_roles (sort_order asc);

create table if not exists public.user_custom_roles (
  user_id     uuid not null references public.users(id) on delete cascade,
  role_id     uuid not null references public.custom_roles(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists user_custom_roles_user_idx on public.user_custom_roles (user_id);
create index if not exists user_custom_roles_role_idx on public.user_custom_roles (role_id);

-- Seed the two roles referenced by the quick-assign buttons in
-- Manage Players, so they exist out of the box. Staff can still
-- rename/recolor/delete them like any other custom role.
insert into public.custom_roles (name, color, icon, sort_order)
select * from (values
  ('Beta Tester', '#4d7dff', '🧪', 0),
  ('Early Access', '#c896ff', '🚀', 1)
) as seed(name, color, icon, sort_order)
where not exists (
  select 1 from public.custom_roles cr where cr.name = seed.name
);

alter table public.custom_roles enable row level security;
alter table public.user_custom_roles enable row level security;

drop policy if exists custom_roles_read on public.custom_roles;
create policy custom_roles_read on public.custom_roles for select using (true);

drop policy if exists user_custom_roles_read on public.user_custom_roles;
create policy user_custom_roles_read on public.user_custom_roles for select using (true);

-- No anon write policies — all writes go through server routes
-- using the service role, gated on the create_custom_roles /
-- edit_custom_roles / delete_custom_roles / assign_custom_roles
-- Status Permissions (see lib/permissions-shared.ts), same pattern
-- as every other write path in this app.
