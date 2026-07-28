import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/guard";
import { isOwner, isOwnerOrCoOwner, getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

const ROLES = [
  "Member",
  "Verified",
  "Moderator",
  "Admin",
  "Owner",
  "Co-Owner",
  "Helper",
] as const;

// GET — public profile: base user fields plus follower/following
// counts and (if signed in) whether the viewer follows this user.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const profile = await queryOne(
    `select id, username, role, level, level_label, bio, avatar_seed,
            approved_count, rejected_count, created_at, follower_offset
     from users where id = $1`,
    [id]
  );
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const [followerCount, followingCount] = await Promise.all([
    queryOne<{ count: string }>(
      `select count(*)::text as count from follows where following_id = $1`,
      [id]
    ),
    queryOne<{ count: string }>(
      `select count(*)::text as count from follows where follower_id = $1`,
      [id]
    ),
  ]);

  const { follower_offset, ...publicProfile } = profile as any;

  const viewer = await getCurrentUser();
  let isFollowing = false;
  if (viewer && viewer.id !== id) {
    const row = await queryOne(
      `select 1 from follows where follower_id = $1 and following_id = $2`,
      [viewer.id, id]
    );
    isFollowing = !!row;
  }

  return NextResponse.json({
    user: {
      ...publicProfile,
      follower_count: Math.max(0, Number(followerCount?.count ?? 0) + Number(follower_offset ?? 0)),
      following_count: Number(followingCount?.count ?? 0),
      is_following: isFollowing,
      is_self: viewer?.id === id,
    },
  });
}

// PATCH — two modes:
// 1. Self profile edit (bio) — any signed-in user, own account only.
// 2. Admin actions (level, role, suspended, banned) — Admin/Owner only.
//    Role changes to/from "Owner" require the caller to already be Owner.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: {
    bio?: string;
    username?: string;
    level?: string | number;
    role?: (typeof ROLES)[number];
    suspended?: boolean;
    banned?: boolean;
    follower_count?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const wantsAdminField =
    body.level !== undefined ||
    body.role !== undefined ||
    body.suspended !== undefined ||
    body.banned !== undefined ||
    body.follower_count !== undefined;

  if (wantsAdminField) {
    const guarded = await requireUser();
    if ("error" in guarded) return guarded.error;

    const sets: string[] = [];
    const values: any[] = [];

    if (body.level !== undefined) {
      if (!(await hasPermission(guarded.user, "change_user_levels"))) {
        return NextResponse.json(
          { error: "You don't have permission to change levels." },
          { status: 403 }
        );
      }
      const raw = String(body.level).trim();
      const isPlainInt = /^\d+$/.test(raw);
      if (isPlainInt) {
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 1) {
          return NextResponse.json({ error: "Invalid level." }, { status: 400 });
        }
        values.push(v);
        sets.push(`level = $${values.length}`);
        sets.push(`level_label = null`);
      } else {
        if (!raw) {
          return NextResponse.json({ error: "Level can't be empty." }, { status: 400 });
        }
        values.push(raw.slice(0, 40));
        sets.push(`level_label = $${values.length}`);
      }
    }
    if (body.role !== undefined) {
      if (!(await hasPermission(guarded.user, "change_user_statuses"))) {
        return NextResponse.json(
          { error: "You don't have permission to change statuses." },
          { status: 403 }
        );
      }
      if (!ROLES.includes(body.role)) {
        return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      }
      if (body.role === "Owner" && !isOwner(guarded.user.role)) {
        return NextResponse.json(
          { error: "Only an Owner can grant Owner." },
          { status: 403 }
        );
      }
      if (body.role === "Co-Owner" && !isOwnerOrCoOwner(guarded.user.role)) {
        return NextResponse.json(
          { error: "Only an Owner or Co-Owner can grant Co-Owner." },
          { status: 403 }
        );
      }
      values.push(body.role);
      sets.push(`role = $${values.length}`);
    }
    if (body.suspended !== undefined) {
      if (!(await hasPermission(guarded.user, "suspend_users"))) {
        return NextResponse.json(
          { error: "You don't have permission to suspend users." },
          { status: 403 }
        );
      }
      values.push(!!body.suspended);
      sets.push(`suspended = $${values.length}`);
    }
    if (body.banned !== undefined) {
      const neededPermission = body.banned ? "ban_users" : "unban_users";
      if (!(await hasPermission(guarded.user, neededPermission))) {
        return NextResponse.json(
          { error: "You don't have permission to do that." },
          { status: 403 }
        );
      }
      values.push(!!body.banned);
      sets.push(`banned = $${values.length}`);
    }
    if (body.follower_count !== undefined) {
      if (!(await hasPermission(guarded.user, "edit_follower_counts"))) {
        return NextResponse.json(
          { error: "You don't have permission to change follower counts." },
          { status: 403 }
        );
      }
      const target = Math.trunc(Number(body.follower_count));
      const MAX_FOLLOWERS = 1_000_000_000;
      if (!Number.isFinite(target) || target < 0 || target > MAX_FOLLOWERS) {
        return NextResponse.json(
          { error: `Follower count must be a non-negative number up to ${MAX_FOLLOWERS.toLocaleString()}.` },
          { status: 400 }
        );
      }
      const real = await queryOne<{ count: string }>(
        `select count(*)::text as count from follows where following_id = $1`,
        [id]
      );
      values.push(target - Number(real?.count ?? 0));
      sets.push(`follower_offset = $${values.length}`);
    }

    if (!sets.length) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    values.push(id);
    const rows = await query(
      `update users set ${sets.join(", ")} where id = $${values.length}
       returning id, username, role, level, level_label, suspended, banned,
         (select greatest(0, count(*) + users.follower_offset) from follows where following_id = users.id) as follower_count`,
      values
    );
    if (!rows[0]) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ user: rows[0] });
  }

  // Self profile edit (bio and/or username)
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;
  if (guarded.user.id !== id) {
    return NextResponse.json({ error: "You can only edit your own profile." }, { status: 403 });
  }

  const selfSets: string[] = [];
  const selfValues: any[] = [];

  if (body.bio !== undefined) {
    selfValues.push(body.bio.slice(0, 300));
    selfSets.push(`bio = $${selfValues.length}`);
  }

  if (body.username !== undefined) {
    const uname = body.username.trim();
    const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
    if (!USERNAME_RE.test(uname)) {
      return NextResponse.json(
        { error: "Username must be 3-20 characters, letters/numbers/underscore only." },
        { status: 400 }
      );
    }
    selfValues.push(uname);
    selfSets.push(`username = $${selfValues.length}`);
  }

  if (!selfSets.length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  selfValues.push(id);
  try {
    const rows = await query(
      `update users set ${selfSets.join(", ")} where id = $${selfValues.length}
       returning id, username, bio`,
      selfValues
    );
    return NextResponse.json({ user: rows[0] });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("delete_users");
  if ("error" in guarded) return guarded.error;

  if (guarded.user.id === id) {
    return NextResponse.json({ error: "You can't delete your own account here." }, { status: 400 });
  }

  await query(`delete from users where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
