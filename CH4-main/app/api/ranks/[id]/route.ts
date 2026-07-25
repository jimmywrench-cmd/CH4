import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireAdmin();
  if ("error" in guarded) return guarded.error;

  let body: { min_level?: number; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sets: string[] = [];
  const values: any[] = [];

  if (body.min_level !== undefined) {
    const v = Number(body.min_level);
    if (!Number.isFinite(v) || v < 1) {
      return NextResponse.json({ error: "Invalid min level." }, { status: 400 });
    }
    values.push(v);
    sets.push(`min_level = $${values.length}`);
  }
  if (body.name !== undefined) {
    const v = body.name.trim();
    if (!v) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    values.push(v);
    sets.push(`name = $${values.length}`);
  }
  if (!sets.length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  values.push(id);
  const rows = await query(
    `update ranks set ${sets.join(", ")} where id = $${values.length}
     returning id, name, min_level, sort_order`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: "Rank not found." }, { status: 404 });

  return NextResponse.json({ rank: rows[0] });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireAdmin();
  if ("error" in guarded) return guarded.error;

  const remaining = await query<{ count: string }>(`select count(*)::text as count from ranks`);
  if (Number(remaining[0]?.count ?? 0) <= 1) {
    return NextResponse.json({ error: "Can't remove the last rank." }, { status: 400 });
  }

  await query(`delete from ranks where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
