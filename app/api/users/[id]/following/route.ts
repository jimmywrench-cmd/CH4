import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// GET /api/users/[id]/following — users this user follows.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const rows = await query(
    `select u.id, u.username, u.role, u.level, u.level_label,
            (f2.follower_id is not null) as is_following
     from follows f
     join users u on u.id = f.following_id
     left join follows f2 on f2.follower_id = $2 and f2.following_id = u.id
     where f.follower_id = $1
     order by f.created_at desc`,
    [id, guarded.user.id]
  );

  return NextResponse.json({ users: rows });
}
