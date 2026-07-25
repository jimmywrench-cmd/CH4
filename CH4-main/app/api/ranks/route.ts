import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const rows = await query(
    `select id, name, min_level, sort_order from ranks order by sort_order asc`
  );
  return NextResponse.json({ ranks: rows });
}

export async function POST(req: NextRequest) {
  const guarded = await requireAdmin();
  if ("error" in guarded) return guarded.error;

  let body: { name?: string; min_level?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const min_level = Number(body.min_level);
  if (!name || !Number.isFinite(min_level) || min_level < 1) {
    return NextResponse.json({ error: "Valid name and min level required." }, { status: 400 });
  }

  const maxOrder = await query<{ max: number | null }>(
    `select max(sort_order) as max from ranks`
  );
  const nextOrder = (maxOrder[0]?.max ?? -1) + 1;

  const rows = await query(
    `insert into ranks (name, min_level, sort_order) values ($1, $2, $3)
     returning id, name, min_level, sort_order`,
    [name, min_level, nextOrder]
  );

  return NextResponse.json({ rank: rows[0] });
}
