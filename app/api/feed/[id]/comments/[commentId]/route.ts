import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { hasPermission } from "@/lib/permissions";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { commentId } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const comment = await queryOne<{ user_id: string }>(
    `select user_id from video_comments where id = $1`,
    [commentId]
  );
  if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });

  const canDelete =
    comment.user_id === guarded.user.id || (await hasPermission(guarded.user, "manage_shorts"));
  if (!canDelete) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  await query(`update video_comments set deleted = true where id = $1`, [commentId]);
  return NextResponse.json({ ok: true });
}
