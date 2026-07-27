import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("manage_reports");
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `update video_reports set resolved = true where id = $1 returning id`,
    [id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
