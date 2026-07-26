import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { isStaff } from "@/lib/auth";

async function checkMembership(groupId: string, userId: string) {
  const row = await queryOne(
    `select 1 from dm_group_members where dm_group_id = $1 and user_id = $2`,
    [groupId, userId]
  );
  return !!row;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  if (!(await checkMembership(id, guarded.user.id))) {
    return NextResponse.json({ error: "Not a member of this group." }, { status: 403 });
  }

  const messages = await query(
    `select m.id, m.text, m.reply_to_id, m.created_at,
            u.id as user_id, u.username, u.role, u.level, u.level_label,
            r.id as reply_user_id, r.username as reply_username, rm.text as reply_text,
            coalesce(
              (select json_agg(
                 json_build_object(
                   'id', cr.id, 'name', cr.name, 'color', cr.color, 'bold', cr.bold,
                   'italic', cr.italic, 'underline', cr.underline,
                   'strikethrough', cr.strikethrough, 'icon', cr.icon
                 ) order by cr.sort_order
               )
               from user_custom_roles ucr
               join custom_roles cr on cr.id = ucr.role_id
               where ucr.user_id = u.id),
              '[]'::json
            ) as custom_roles
     from dm_messages m
     join users u on u.id = m.user_id
     left join dm_messages rm on rm.id = m.reply_to_id and not rm.deleted
     left join users r on r.id = rm.user_id
     where not m.deleted and m.dm_group_id = $1
     order by m.created_at asc
     limit 200`,
    [id]
  );

  const members = await query(
    `select u.id, u.username, u.role,
            coalesce(
              (select json_agg(
                 json_build_object(
                   'id', cr.id, 'name', cr.name, 'color', cr.color, 'bold', cr.bold,
                   'italic', cr.italic, 'underline', cr.underline,
                   'strikethrough', cr.strikethrough, 'icon', cr.icon
                 ) order by cr.sort_order
               )
               from user_custom_roles ucr
               join custom_roles cr on cr.id = ucr.role_id
               where ucr.user_id = u.id),
              '[]'::json
            ) as custom_roles
     from dm_group_members gm join users u on u.id = gm.user_id
     where gm.dm_group_id = $1
     order by u.username`,
    [id]
  );

  return NextResponse.json({ messages, members });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  if (guarded.user.suspended) {
    return NextResponse.json(
      { error: "You're suspended and can't chat right now." },
      { status: 403 }
    );
  }

  if (!(await checkMembership(id, guarded.user.id))) {
    return NextResponse.json({ error: "Not a member of this group." }, { status: 403 });
  }

  let body: { text?: string; reply_to_id?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
  }

  const rows = await query(
    `insert into dm_messages (dm_group_id, user_id, text, reply_to_id)
     values ($1, $2, $3, $4)
     returning id, text, reply_to_id, created_at`,
    [id, guarded.user.id, text, body.reply_to_id ?? null]
  );

  return NextResponse.json({ message: rows[0] });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("message_id");
  if (!messageId) {
    return NextResponse.json({ error: "message_id is required." }, { status: 400 });
  }

  const msg = await queryOne<{ user_id: string }>(
    `select user_id from dm_messages where id = $1 and dm_group_id = $2`,
    [messageId, id]
  );
  if (!msg) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const canDelete = msg.user_id === guarded.user.id || isStaff(guarded.user.role);
  if (!canDelete) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  await query(`update dm_messages set deleted = true where id = $1`, [messageId]);
  return NextResponse.json({ ok: true });
}
