import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireStaff } from "@/lib/guard";

export async function GET() {
  const guarded = await requireStaff();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select u.id, u.username, u.role, u.level, u.level_label, u.approved_count, u.rejected_count,
            u.suspended, u.banned, u.created_at,
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
     order by u.created_at asc`
  );

  return NextResponse.json({ users: rows });
}
