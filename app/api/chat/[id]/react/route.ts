import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// A tight allow-list keeps this a quick-react bar (Discord-style)
// rather than a full emoji picker with arbitrary text input.
const ALLOWED_EMOJI = new Set(["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "✅"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { emoji?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const emoji = (body.emoji || "").trim();
  if (!ALLOWED_EMOJI.has(emoji)) {
    return NextResponse.json({ error: "Unsupported emoji." }, { status: 400 });
  }

  const msg = await queryOne<{ id: number }>(`select id from chat_messages where id = $1`, [id]);
  if (!msg) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const existing = await queryOne(
    `select id from chat_reactions where message_id = $1 and user_id = $2 and emoji = $3`,
    [id, guarded.user.id, emoji]
  );

  if (existing) {
    await query(`delete from chat_reactions where id = $1`, [existing.id]);
  } else {
    await query(
      `insert into chat_reactions (message_id, user_id, emoji) values ($1, $2, $3)
       on conflict (message_id, user_id, emoji) do nothing`,
      [id, guarded.user.id, emoji]
    );
  }

  const rows = await query(
    `select emoji, count(*)::int as count, coalesce(bool_or(user_id = $2), false) as reacted
     from chat_reactions where message_id = $1 group by emoji order by min(created_at)`,
    [id, guarded.user.id]
  );

  return NextResponse.json({ reactions: rows });
}
