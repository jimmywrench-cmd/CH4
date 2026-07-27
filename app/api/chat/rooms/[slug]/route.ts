import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const guarded = await requirePermission("delete_chat_rooms");
  if ("error" in guarded) return guarded.error;

  if (slug === "general") {
    return NextResponse.json({ error: "The #general room can't be deleted." }, { status: 400 });
  }

  const room = await queryOne<{ id: number }>(`select id from chat_rooms where slug = $1`, [slug]);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  // chat_messages.room_id has ON DELETE CASCADE, so this also clears
  // the room's message history.
  await query(`delete from chat_rooms where id = $1`, [room.id]);

  return NextResponse.json({ ok: true });
}
