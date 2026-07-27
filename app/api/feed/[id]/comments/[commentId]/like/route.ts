import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { commentId } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const existing = await query(
    `select 1 from video_comment_likes where comment_id = $1 and user_id = $2`,
    [commentId, guarded.user.id]
  );

  if (existing.length > 0) {
    await query(`delete from video_comment_likes where comment_id = $1 and user_id = $2`, [
      commentId,
      guarded.user.id,
    ]);
    return NextResponse.json({ liked: false });
  }

  await query(`insert into video_comment_likes (comment_id, user_id) values ($1, $2)`, [
    commentId,
    guarded.user.id,
  ]);
  return NextResponse.json({ liked: true });
}
