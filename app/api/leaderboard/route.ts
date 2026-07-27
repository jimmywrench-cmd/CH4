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
    `select u.id, u.username, u.role, u.level, u.level_label, u.approved_count, u.rejected_count,
            u.last_seen, u.created_at,
            coalesce(
              (select json_agg(
                 json_build_object(
                   'id', cr.id, 'name', cr.name, 'color', cr.color, 'bold', cr.bold,
                   'italic', cr.italic, 'underline', cr.underline,
                   'strikethrough', cr.strikethrough, 'icon', cr.icon
                 ) order by cr.sort_order
               )
               from user_custom_roles ucr
               join custom_roles cr on cr.id = ucr.role_id
               where ucr.user_id = u.id),
              '[]'::json
            ) as custom_roles
     from users u
     where not u.banned
     order by ${orderBy}
     limit 100`
  );

  return NextResponse.json({ users: rows });
}
