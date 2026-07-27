import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/feed/[id]/view
//
// Two calls, same endpoint:
// - No body (or omit `seconds`): a view is starting — bumps view_count.
//   Call this once when a video becomes the active card in the feed.
// - { seconds, duration }: the viewing session ended — logs a row for
//   the analytics panel (avg watch time / avg watch %) and adds to
//   the running total_watch_seconds. Call this on scroll-away or loop.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { seconds?: number; duration?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — treated as a view-start ping
  }

  if (typeof body.seconds === "number" && body.seconds >= 0) {
    await query(
      `insert into video_views (submission_id, user_id, watch_seconds, video_duration)
       values ($1, $2, $3, $4)`,
      [id, guarded.user.id, body.seconds, body.duration ?? null]
    );
    await query(
      `update submissions set total_watch_seconds = total_watch_seconds + $1 where id = $2`,
      [body.seconds, id]
    );
    return NextResponse.json({ ok: true, logged: "watch_session" });
  }

  await query(`update submissions set view_count = view_count + 1 where id = $1`, [id]);
  return NextResponse.json({ ok: true, logged: "view" });
}
