import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const SORTS: Record<string, string> = {
  level: "level desc, approved_count desc",
  approved: "approved_count desc, level desc",
  active: "last_seen desc",
  newest: "created_at desc",
  contributors: "(approved_count + rejected_count) desc",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") || "level";
  const orderBy = SORTS[tab] || SORTS.level;

  const rows = await query(
    `select id, username, role, level, approved_count, rejected_count, last_seen, created_at
     from users
     where not banned
     order by ${orderBy}
     limit 100`
  );

  return NextResponse.json({ users: rows });
}
