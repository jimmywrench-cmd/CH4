import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("accept_videos");
  if ("error" in guarded) return guarded.error;

  try {
    await query(`select approve_submission($1, $2)`, [id, guarded.user.id]);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Could not approve submission." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
