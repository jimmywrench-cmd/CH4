import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/guard";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function GET() {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select id, name, color, bold, italic, underline, strikethrough, icon, sort_order, created_at
     from custom_roles
     order by sort_order asc, created_at asc`
  );
  return NextResponse.json({ roles: rows });
}

export async function POST(req: NextRequest) {
  const guarded = await requirePermission("create_custom_roles");
  if ("error" in guarded) return guarded.error;

  let body: {
    name?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    icon?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name || name.length > 40) {
    return NextResponse.json({ error: "Name must be 1-40 characters." }, { status: 400 });
  }
  const color = (body.color || "#e6e6e6").trim();
  if (!HEX_RE.test(color)) {
    return NextResponse.json({ error: "Color must be a hex value like #4d7dff." }, { status: 400 });
  }
  const icon = body.icon ? body.icon.trim().slice(0, 8) : null;

  const maxOrder = await query<{ max: number | null }>(
    `select max(sort_order) as max from custom_roles`
  );
  const nextOrder = (maxOrder[0]?.max ?? -1) + 1;

  const rows = await query(
    `insert into custom_roles (name, color, bold, italic, underline, strikethrough, icon, sort_order, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, name, color, bold, italic, underline, strikethrough, icon, sort_order, created_at`,
    [
      name,
      color,
      !!body.bold,
      !!body.italic,
      !!body.underline,
      !!body.strikethrough,
      icon,
      nextOrder,
      guarded.user.id,
    ]
  );

  return NextResponse.json({ role: rows[0] });
}
