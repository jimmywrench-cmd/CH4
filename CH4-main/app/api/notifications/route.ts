import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

export async function GET() {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select id, text, read, created_at from notifications
     where user_id = $1 order by created_at desc limit 30`,
    [guarded.user.id]
  );

  return NextResponse.json({ notifications: rows });
}
