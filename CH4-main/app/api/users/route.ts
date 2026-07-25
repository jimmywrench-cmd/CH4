import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireStaff } from "@/lib/guard";

export async function GET() {
  const guarded = await requireStaff();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select id, username, role, level, approved_count, rejected_count,
            suspended, banned, created_at
     from users
     order by created_at asc`
  );

  return NextResponse.json({ users: rows });
}
