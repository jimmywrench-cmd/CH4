import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/shorts  { title?, description?, video_path }
//
// Direct-upload path for Shorts: publishes immediately, no
// accept/deny queue. Under the hood this is still a `submissions`
// row (so it gets to reuse likes/comments/reports/views), but it's
// inserted already `status = 'approved'` with `source = 'direct'`,
// which keeps it out of the review queue entirely and out of the
// leveling system — it never touches level or approved_count.
export async function POST(req: NextRequest) {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { title?: string; description?: string; video_path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.video_path) {
    return NextResponse.json({ error: "A video must be uploaded first." }, { status: 400 });
  }

  const title = (body.title || "").trim() || `${guarded.user.username}'s short`;
  const description = (body.description || "").trim();

  const rows = await query(
    `insert into submissions
       (user_id, title, description, video_path, level_at_submit, status, source, reviewed_at)
     values ($1, $2, $3, $4, $5, 'approved', 'direct', now())
     returning id, title, description, video_path, status, source, created_at`,
    [guarded.user.id, title, description, body.video_path, guarded.user.level]
  );

  return NextResponse.json({ short: rows[0] });
}
