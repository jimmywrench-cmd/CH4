import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("edit_custom_roles");
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

  const sets: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) {
    const v = body.name.trim();
    if (!v || v.length > 40) {
      return NextResponse.json({ error: "Name must be 1-40 characters." }, { status: 400 });
    }
    values.push(v);
    sets.push(`name = $${values.length}`);
  }
  if (body.color !== undefined) {
    if (!HEX_RE.test(body.color)) {
      return NextResponse.json({ error: "Color must be a hex value like #4d7dff." }, { status: 400 });
    }
    values.push(body.color);
    sets.push(`color = $${values.length}`);
  }
  for (const key of ["bold", "italic", "underline", "strikethrough"] as const) {
    if (body[key] !== undefined) {
      values.push(!!body[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (body.icon !== undefined) {
    values.push(body.icon ? body.icon.trim().slice(0, 8) : null);
    sets.push(`icon = $${values.length}`);
  }

  if (!sets.length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  values.push(id);
  const rows = await query(
    `update custom_roles set ${sets.join(", ")} where id = $${values.length}
     returning id, name, color, bold, italic, underline, strikethrough, icon, sort_order, created_at`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  return NextResponse.json({ role: rows[0] });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("delete_custom_roles");
  if ("error" in guarded) return guarded.error;

  await query(`delete from custom_roles where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
