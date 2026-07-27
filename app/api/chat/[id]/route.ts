import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { hasPermission } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
  }

  const msg = await queryOne<{ user_id: string }>(
    `select user_id from chat_messages where id = $1`,
    [id]
  );
  if (!msg) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (msg.user_id !== guarded.user.id) {
    return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
  }

  const rows = await query(
    `update chat_messages set text = $1, edited_at = now() where id = $2
     returning id, text, edited_at`,
    [text, id]
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

  const msg = await queryOne<{ user_id: string }>(
    `select user_id from chat_messages where id = $1`,
    [id]
  );
  if (!msg) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const canDelete =
    msg.user_id === guarded.user.id ||
    (await hasPermission(guarded.user, "delete_chat_messages"));
  if (!canDelete) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  await query(`update chat_messages set deleted = true where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
