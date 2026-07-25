import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { isStaff } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const msg = await queryOne<{ user_id: string }>(
    `select user_id from chat_messages where id = $1`,
    [id]
  );
  if (!msg) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const canDelete = msg.user_id === guarded.user.id || isStaff(guarded.user.role);
  if (!canDelete) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  await query(`update chat_messages set deleted = true where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
