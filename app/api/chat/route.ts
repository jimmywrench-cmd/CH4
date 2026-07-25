import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

export async function GET() {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select m.id, m.text, m.reply_to_id, m.pinned, m.created_at,
            u.id as user_id, u.username, u.role, u.level,
            r.id as reply_user_id, r.username as reply_username, rm.text as reply_text
     from chat_messages m
     join users u on u.id = m.user_id
     left join chat_messages rm on rm.id = m.reply_to_id and not rm.deleted
     left join users r on r.id = rm.user_id
     where not m.deleted
     order by m.created_at asc
     limit 200`
  );

  return NextResponse.json({ messages: rows });
}

export async function POST(req: NextRequest) {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

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
    `insert into chat_messages (user_id, text, reply_to_id)
     values ($1, $2, $3)
     returning id, text, reply_to_id, pinned, created_at`,
    [guarded.user.id, text, body.reply_to_id ?? null]
  );

  return NextResponse.json({ message: rows[0] });
}
