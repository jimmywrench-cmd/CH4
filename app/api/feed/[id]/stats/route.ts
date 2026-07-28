import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

// PATCH /api/feed/[id]/stats  { view_count?, likes?, dislikes? }
//
// view_count is a plain column and gets set directly. likes/dislikes
// are normally computed from real video_likes rows, so instead of
// overwriting them we store the *difference* between the requested
// number and the real vote count as like_offset/dislike_offset —
// real votes keep counting normally on top of (or under) that
// baseline afterwards.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("edit_video_stats");
  if ("error" in guarded) return guarded.error;

  let body: { view_count?: number; likes?: number; dislikes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sets: string[] = [];
  const values: any[] = [];

  // view_count is a plain `integer` column, so cap well under the
  // int4 ceiling (~2.1 billion) — and keep offsets in the same
  // range so `likes * 3` in the feed's trending sort can never
  // overflow, even though the offset columns themselves are bigint.
  const MAX_STAT = 1_000_000_000;

  function asNonNegativeInt(v: unknown): number | null {
    if (v === undefined || v === null) return null;
    const n = Math.trunc(Number(v));
    if (!Number.isFinite(n) || n < 0 || n > MAX_STAT) return null;
    return n;
  }

  if (body.view_count !== undefined) {
    const v = asNonNegativeInt(body.view_count);
    if (v === null) {
      return NextResponse.json(
        { error: `view_count must be a non-negative number up to ${MAX_STAT.toLocaleString()}.` },
        { status: 400 }
      );
    }
    values.push(v);
    sets.push(`view_count = $${values.length}`);
  }

  if (body.likes !== undefined) {
    const target = asNonNegativeInt(body.likes);
    if (target === null) {
      return NextResponse.json(
        { error: `likes must be a non-negative number up to ${MAX_STAT.toLocaleString()}.` },
        { status: 400 }
      );
    }
    const real = await queryOne<{ count: string }>(
      `select count(*)::text as count from video_likes where submission_id = $1 and value = 1`,
      [id]
    );
    values.push(target - Number(real?.count ?? 0));
    sets.push(`like_offset = $${values.length}`);
  }

  if (body.dislikes !== undefined) {
    const target = asNonNegativeInt(body.dislikes);
    if (target === null) {
      return NextResponse.json(
        { error: `dislikes must be a non-negative number up to ${MAX_STAT.toLocaleString()}.` },
        { status: 400 }
      );
    }
    const real = await queryOne<{ count: string }>(
      `select count(*)::text as count from video_likes where submission_id = $1 and value = -1`,
      [id]
    );
    values.push(target - Number(real?.count ?? 0));
    sets.push(`dislike_offset = $${values.length}`);
  }

  if (!sets.length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  values.push(id);
  const rows = await query(
    `update submissions set ${sets.join(", ")} where id = $${values.length}
     returning id, view_count,
       greatest(0, (select count(*) from video_likes vl where vl.submission_id = submissions.id and vl.value = 1) + like_offset) as likes,
       greatest(0, (select count(*) from video_likes vl where vl.submission_id = submissions.id and vl.value = -1) + dislike_offset) as dislikes`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  return NextResponse.json({ ok: true, video: rows[0] });
}
