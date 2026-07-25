-- ============================================================
-- CH4 — migration 2
-- Run this ONCE in the Supabase SQL Editor against your existing
-- database. Safe to run more than once (all steps are guarded).
-- ============================================================

alter table public.users add column if not exists level_label text;
alter table public.ranks add column if not exists max_level_override int;

-- Updated approve function: suspended users still get their
-- submission approved (and approved_count bumped) but do NOT
-- gain a level while suspended.
create or replace function public.approve_submission(p_submission_id bigint, p_reviewer_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_status text;
  v_suspended boolean;
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

  select suspended into v_suspended from public.users where id = v_user_id;

  if v_suspended then
    update public.users
      set approved_count = approved_count + 1
      where id = v_user_id;
    insert into public.notifications (user_id, text)
      values (v_user_id, 'Your submission was approved (no level gained while suspended).');
  else
    update public.users
      set level = level + 1, approved_count = approved_count + 1
      where id = v_user_id;
    insert into public.notifications (user_id, text)
      values (v_user_id, 'Your submission was approved and you leveled up!');
  end if;
end;
$$;
