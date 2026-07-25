import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const rows = await query(
    `select id, title, body, created_at from announcements order by created_at desc limit 20`
  );
  return NextResponse.json({ announcements: rows });
}

export async function POST(req: NextRequest) {
  const guarded = await requireAdmin();
  if ("error" in guarded) return guarded.error;

  let body: { title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = (body.title || "").trim();
  const text = (body.body || "").trim();
  if (!title || !text) {
    return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
  }

  const rows = await query(
    `insert into announcements (title, body, posted_by) values ($1, $2, $3)
     returning id, title, body, created_at`,
    [title, text, guarded.user.id]
  );

  return NextResponse.json({ announcement: rows[0] });
}
