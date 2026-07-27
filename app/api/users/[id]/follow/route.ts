import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/users/[id]/follow — follow this user.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  if (guarded.user.id === id) {
    return NextResponse.json({ error: "You can't follow yourself." }, { status: 400 });
  }

  const target = await queryOne(`select id, username from users where id = $1`, [id]);
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  await query(
    `insert into follows (follower_id, following_id) values ($1, $2)
     on conflict (follower_id, following_id) do nothing`,
    [guarded.user.id, id]
  );

  await query(
    `insert into notifications (user_id, text) values ($1, $2)`,
    [id, `@${guarded.user.username} started following you.`]
  );

  const followerCount = await queryOne<{ count: string }>(
    `select greatest(0, (select count(*) from follows where following_id = $1)
       + (select follower_offset from users where id = $1))::text as count`,
    [id]
  );

  return NextResponse.json({
    following: true,
    follower_count: Number(followerCount?.count ?? 0),
  });
}

// DELETE /api/users/[id]/follow — unfollow this user.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  await query(
    `delete from follows where follower_id = $1 and following_id = $2`,
    [guarded.user.id, id]
  );

  const followerCount = await queryOne<{ count: string }>(
    `select greatest(0, (select count(*) from follows where following_id = $1)
       + (select follower_offset from users where id = $1))::text as count`,
    [id]
  );

  return NextResponse.json({
    following: false,
    follower_count: Number(followerCount?.count ?? 0),
  });
}
