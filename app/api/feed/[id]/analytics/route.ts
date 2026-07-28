import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("view_analytics");
  if ("error" in guarded) return guarded.error;

  const row = await queryOne<{
    view_count: number;
    total_watch_seconds: number;
    share_count: number;
    likes: number;
    dislikes: number;
    comment_count: number;
    report_count: number;
    avg_watch_seconds: number | null;
    avg_watch_pct: number | null;
  }>(
    `select
       s.view_count, s.total_watch_seconds, s.share_count,
       greatest(0, (select count(*) from video_likes vl where vl.submission_id = s.id and vl.value = 1) + s.like_offset) as likes,
       greatest(0, (select count(*) from video_likes vl where vl.submission_id = s.id and vl.value = -1) + s.dislike_offset) as dislikes,
       (select count(*) from video_comments vc where vc.submission_id = s.id and not vc.deleted)::int as comment_count,
       (select count(*) from video_reports vr where vr.submission_id = s.id)::int as report_count,
       (select avg(watch_seconds) from video_views vv where vv.submission_id = s.id) as avg_watch_seconds,
       (select avg(watch_seconds / nullif(video_duration, 0)) * 100
          from video_views vv where vv.submission_id = s.id and video_duration is not null) as avg_watch_pct
     from submissions s
     where s.id = $1`,
    [id]
  );

  if (!row) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  return NextResponse.json({ analytics: row });
}
