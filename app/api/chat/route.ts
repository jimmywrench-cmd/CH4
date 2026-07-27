import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";

export async function GET(req: NextRequest) {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const { searchParams } = new URL(req.url);
  const roomSlug = searchParams.get("room") || "general";

  const room = await queryOne<{ id: number }>(
    `select id from chat_rooms where slug = $1`,
    [roomSlug]
  );
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const rows = await query(
    `select m.id, m.text, m.reply_to_id, m.pinned, m.created_at,
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
     from chat_messages m
     join users u on u.id = m.user_id
     left join chat_messages rm on rm.id = m.reply_to_id and not rm.deleted
     left join users r on r.id = rm.user_id
     where not m.deleted and m.room_id = $1
     order by m.created_at asc
     limit 200`,
    [room.id]
  );

  return NextResponse.json({ messages: rows });
}

export async function POST(req: NextRequest) {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  if (guarded.user.suspended) {
    return NextResponse.json(
      { error: "You're suspended and can't chat right now." },
      { status: 403 }
    );
  }

  let body: { text?: string; reply_to_id?: number | null; room?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
  }

  const roomSlug = body.room || "general";
  const room = await queryOne<{ id: number }>(
    `select id from chat_rooms where slug = $1`,
    [roomSlug]
  );
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const rows = await query(
    `insert into chat_messages (user_id, text, reply_to_id, room_id)
     values ($1, $2, $3, $4)
     returning id, text, reply_to_id, pinned, created_at`,
    [guarded.user.id, text, body.reply_to_id ?? null, room.id]
  );

  return NextResponse.json({ message: rows[0] });
}
