import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser, requireStaff } from "@/lib/guard";
import { createSignedPlaybackUrl } from "@/lib/storage";

// GET /api/submissions?status=pending  (staff sees queue; anyone can filter their own via ?mine=1)
// GET /api/submissions?user_id=<id>    (staff only, unless it's your own id — powers the
//   "Approved Videos" / "View Submitted Videos" panels on the Manage Players page)
// GET /api/submissions?source=review   (defaults to all sources — pass this to only see
//   clips that went through the accept/deny queue, excluding directly-uploaded Shorts)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const mine = searchParams.get("mine");
  const userId = searchParams.get("user_id");
  const source = searchParams.get("source");

  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  if (userId && userId !== guarded.user.id) {
    const staffGuarded = await requireStaff();
    if ("error" in staffGuarded) return staffGuarded.error;
  }

  const conditions: string[] = [];
  const params: any[] = [];

  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }
  if (mine) {
    params.push(guarded.user.id);
    conditions.push(`s.user_id = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`s.user_id = $${params.length}`);
  }
  if (source) {
    params.push(source);
    conditions.push(`s.source = $${params.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const rows = await query(
    `select s.id, s.title, s.description, s.video_path, s.status, s.level_at_submit, s.source,
            s.created_at, s.reviewed_at,
            u.id as user_id, u.username, u.level as current_level
     from submissions s
     join users u on u.id = s.user_id
     ${where}
     order by s.created_at desc`,
    params
  );

  const withUrls = await Promise.all(
    rows.map(async (row: any) => {
      if (!row.video_path) return row;
      try {
        const video_url = await createSignedPlaybackUrl(row.video_path);
        return { ...row, video_url };
      } catch (err) {
        console.error("Failed to sign playback URL for", row.video_path, err);
        return row;
      }
    })
  );

  return NextResponse.json({ submissions: withUrls });
}

// POST /api/submissions  { title, description, video_path }
export async function POST(req: NextRequest) {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { title?: string; description?: string; video_path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = (body.title || "").trim();
  const description = (body.description || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (!body.video_path) {
    return NextResponse.json({ error: "A trimmed clip must be uploaded first." }, { status: 400 });
  }

  const rows = await query(
    `insert into submissions (user_id, title, description, video_path, level_at_submit, source)
     values ($1, $2, $3, $4, $5, 'review')
     returning id, title, description, video_path, status, level_at_submit, created_at, source`,
    [guarded.user.id, title, description, body.video_path, guarded.user.level]
  );

  return NextResponse.json({ submission: rows[0] });
}
