import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// GET /api/feed/[id]/comments?sort=top|newest|oldest
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const sort = new URL(req.url).searchParams.get("sort") || "top";
  const orderBy =
    { top: "like_count desc, c.created_at desc", newest: "c.created_at desc", oldest: "c.created_at asc" }[
      sort
    ] ?? "c.created_at desc";

  const rows = await query(
    `select c.id, c.text, c.reply_to_id, c.created_at,
            u.id as user_id, u.username, u.role, u.level,
            r.username as reply_username, r.text as reply_text,
            (select count(*) from video_comment_likes vcl where vcl.comment_id = c.id)::int as like_count,
            exists(
              select 1 from video_comment_likes vcl2
              where vcl2.comment_id = c.id and vcl2.user_id = $2
            ) as liked_by_me
     from video_comments c
     join users u on u.id = c.user_id
     left join video_comments rc on rc.id = c.reply_to_id and not rc.deleted
     left join users r on r.id = rc.user_id
     where c.submission_id = $1 and not c.deleted
     order by ${orderBy}
     limit 300`,
    [id, guarded.user.id]
  );

  return NextResponse.json({ comments: rows });
}

// POST /api/feed/[id]/comments  { text, reply_to_id? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const sub = await queryOne<{ comments_disabled: boolean }>(
    `select comments_disabled from submissions where id = $1`,
    [id]
  );
  if (!sub) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  if (sub.comments_disabled) {
    return NextResponse.json({ error: "Comments are disabled on this video." }, { status: 403 });
  }

  let body: { text?: string; reply_to_id?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  }

  const rows = await query(
    `insert into video_comments (submission_id, user_id, text, reply_to_id)
     values ($1, $2, $3, $4)
     returning id, text, reply_to_id, created_at`,
    [id, guarded.user.id, text, body.reply_to_id ?? null]
  );

  return NextResponse.json({ comment: rows[0] });
}
