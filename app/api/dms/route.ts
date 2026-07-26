import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

export async function GET() {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select g.id, g.name, g.created_at,
            coalesce(
              json_agg(
                json_build_object('id', u.id, 'username', u.username, 'role', u.role)
                order by u.username
              ) filter (where u.id is not null and u.id != $1),
              '[]'
            ) as other_members,
            (
              select lm.text from dm_messages lm
              where lm.dm_group_id = g.id and not lm.deleted
              order by lm.created_at desc limit 1
            ) as last_message,
            (
              select lm.created_at from dm_messages lm
              where lm.dm_group_id = g.id and not lm.deleted
              order by lm.created_at desc limit 1
            ) as last_message_at
     from dm_groups g
     join dm_group_members mine on mine.dm_group_id = g.id and mine.user_id = $1
     left join dm_group_members allm on allm.dm_group_id = g.id
     left join users u on u.id = allm.user_id
     group by g.id
     order by coalesce(
       (select max(lm2.created_at) from dm_messages lm2 where lm2.dm_group_id = g.id and not lm2.deleted),
       g.created_at
     ) desc`,
    [guarded.user.id]
  );

  return NextResponse.json({ groups: rows });
}

export async function POST(req: NextRequest) {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { member_ids?: string[]; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const memberIds = Array.from(
    new Set((body.member_ids || []).filter((id) => typeof id === "string" && id !== guarded.user.id))
  );
  if (memberIds.length === 0) {
    return NextResponse.json({ error: "Pick at least one other person." }, { status: 400 });
  }

  const name = (body.name || "").trim() || null;

  const groupRows = await query<{ id: number }>(
    `insert into dm_groups (name, created_by) values ($1, $2) returning id`,
    [name, guarded.user.id]
  );
  const groupId = groupRows[0].id;

  const allMembers = [guarded.user.id, ...memberIds];
  const values = allMembers.map((_, i) => `($1, $${i + 2})`).join(", ");
  await query(
    `insert into dm_group_members (dm_group_id, user_id) values ${values}`,
    [groupId, ...allMembers]
  );

  return NextResponse.json({ group: { id: groupId, name } });
}
