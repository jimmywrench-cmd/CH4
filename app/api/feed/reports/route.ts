import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

export async function GET() {
  const guarded = await requirePermission("manage_reports");
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select vr.id, vr.reason, vr.resolved, vr.created_at,
            s.id as submission_id, s.title,
            reporter.username as reporter_username,
            owner.username as video_owner
     from video_reports vr
     join submissions s on s.id = vr.submission_id
     join users reporter on reporter.id = vr.user_id
     join users owner on owner.id = s.user_id
     order by vr.resolved asc, vr.created_at desc
     limit 200`
  );

  return NextResponse.json({ reports: rows });
}
