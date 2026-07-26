import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("manage_announcements");
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `delete from announcements where id = $1 returning id`,
    [id]
  );
  if (!rows[0]) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
