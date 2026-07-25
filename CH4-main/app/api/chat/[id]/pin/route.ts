import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireAdmin();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `update chat_messages set pinned = not pinned where id = $1 returning pinned`,
    [id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  return NextResponse.json({ pinned: rows[0].pinned });
}
