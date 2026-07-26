import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

export async function GET() {
  const rows = await query(
    `select a.id, a.title, a.body, a.created_at,
            u.username as posted_by_username, u.role as posted_by_role
     from announcements a
     left join users u on u.id = a.posted_by
     order by a.created_at desc
     limit 20`
  );
  return NextResponse.json({ announcements: rows });
}

export async function POST(req: NextRequest) {
  const guarded = await requirePermission("create_announcements");
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

  // Fan out a notification to every user so the bell + chime fire for them.
  await query(
    `insert into notifications (user_id, text)
     select id, $1 from users`,
    [`📢 New announcement: ${title}`]
  );

  return NextResponse.json({ announcement: rows[0] });
}
