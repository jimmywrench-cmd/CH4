import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/feed/[id]/like  { value: 1 | -1 }
// Toggling the same value again removes your vote entirely.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { value?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.value !== 1 && body.value !== -1) {
    return NextResponse.json({ error: "value must be 1 or -1." }, { status: 400 });
  }

  const existing = await query<{ value: number }>(
    `select value from video_likes where submission_id = $1 and user_id = $2`,
    [id, guarded.user.id]
  );

  if (existing[0]?.value === body.value) {
    await query(`delete from video_likes where submission_id = $1 and user_id = $2`, [
      id,
      guarded.user.id,
    ]);
    return NextResponse.json({ my_vote: null });
  }

  await query(
    `insert into video_likes (submission_id, user_id, value) values ($1, $2, $3)
     on conflict (submission_id, user_id) do update set value = excluded.value, created_at = now()`,
    [id, guarded.user.id, body.value]
  );

  return NextResponse.json({ my_vote: body.value });
}
