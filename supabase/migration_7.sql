-- ============================================================
-- CH4 — migration 7
-- Chat goes Discord-style: only Owner / Co-Owner can manage rooms
-- (create/delete channels) and moderate chat (pin, delete other
-- people's messages). Admin/Moderator/Helper lose these five
-- permissions; DMs and group chats are untouched — they never
-- required any of these permissions.
--
-- Run this ONCE in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

insert into public.status_permissions (status, permission, enabled)
select s.status, perm.permission, (s.status in ('Owner', 'Co-Owner'))
from (
  values ('Owner'), ('Co-Owner'), ('Admin'), ('Moderator'), ('Helper'), ('Verified'), ('Member')
) as s(status)
cross join (
  values
    ('manage_chat'),
    ('delete_chat_messages'),
    ('manage_rooms'),
    ('create_chat_rooms'),
    ('delete_chat_rooms')
) as perm(permission)
on conflict (status, permission) do update
  set enabled = excluded.enabled
  where public.status_permissions.status not in ('Owner', 'Co-Owner');

-- (The `where` clause above leaves any custom Owner/Co-Owner row
-- alone rather than fighting the enforce_owner_permissions trigger;
-- Owner is pinned true by that trigger regardless, and Co-Owner
-- defaults to true here too since it's a fresh insert value.)
