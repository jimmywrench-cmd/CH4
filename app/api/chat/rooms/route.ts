import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/guard";

const SLUG_RE = /^[a-z0-9-]{2,30}$/;

export async function GET() {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select id, slug, name, description, created_at
     from chat_rooms
     order by (slug = 'general') desc, name asc`
  );

  return NextResponse.json({ rooms: rows });
}

export async function POST(req: NextRequest) {
  const guarded = await requirePermission("create_chat_rooms");
  if ("error" in guarded) return guarded.error;

  let body: { slug?: string; name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const slug = (body.slug || "").trim().toLowerCase();
  const name = (body.name || "").trim();
  const description = (body.description || "").trim();

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "Room ID must be 2-30 characters: lowercase letters, numbers, hyphens." },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json({ error: "Room name is required." }, { status: 400 });
  }

  const existing = await queryOne(`select id from chat_rooms where slug = $1`, [slug]);
  if (existing) {
    return NextResponse.json({ error: "A room with that ID already exists." }, { status: 409 });
  }

  const room = await queryOne(
    `insert into chat_rooms (slug, name, description, created_by)
     values ($1, $2, $3, $4)
     returning id, slug, name, description, created_at`,
    [slug, name, description, guarded.user.id]
  );

  return NextResponse.json({ room });
}
