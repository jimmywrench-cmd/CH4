import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select cr.id, cr.name, cr.color, cr.bold, cr.italic, cr.underline, cr.strikethrough, cr.icon
     from user_custom_roles ucr
     join custom_roles cr on cr.id = ucr.role_id
     where ucr.user_id = $1
     order by cr.sort_order asc`,
    [id]
  );

  return NextResponse.json({ roles: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("assign_custom_roles");
  if ("error" in guarded) return guarded.error;

  let body: { role_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.role_id) {
    return NextResponse.json({ error: "role_id is required." }, { status: 400 });
  }

  const user = await query(`select id from users where id = $1`, [id]);
  if (!user[0]) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const role = await query(`select id from custom_roles where id = $1`, [body.role_id]);
  if (!role[0]) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  await query(
    `insert into user_custom_roles (user_id, role_id, assigned_by)
     values ($1, $2, $3)
     on conflict (user_id, role_id) do nothing`,
    [id, body.role_id, guarded.user.id]
  );

  return NextResponse.json({ ok: true });
}
