import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const reason = (body.reason || "").trim();
  if (!reason) {
    return NextResponse.json({ error: "Tell us what's wrong with this video." }, { status: 400 });
  }

  await query(
    `insert into video_reports (submission_id, user_id, reason) values ($1, $2, $3)`,
    [id, guarded.user.id, reason]
  );

  return NextResponse.json({ ok: true });
}
