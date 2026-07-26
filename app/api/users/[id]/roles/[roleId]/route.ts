import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { id, roleId } = await params;
  const guarded = await requirePermission("assign_custom_roles");
  if ("error" in guarded) return guarded.error;

  await query(`delete from user_custom_roles where user_id = $1 and role_id = $2`, [id, roleId]);
  return NextResponse.json({ ok: true });
}
