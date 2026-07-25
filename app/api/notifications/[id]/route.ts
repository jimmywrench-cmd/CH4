import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const notif = await queryOne<{ user_id: string }>(
    `select user_id from notifications where id = $1`,
    [id]
  );
  if (!notif || notif.user_id !== guarded.user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await query(`update notifications set read = true where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
