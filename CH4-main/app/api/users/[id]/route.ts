import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/guard";
import { isOwner } from "@/lib/auth";

const ROLES = ["Member", "Verified", "Moderator", "Admin", "Owner"] as const;

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
    level?: number;
    role?: (typeof ROLES)[number];
    suspended?: boolean;
    banned?: boolean;
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
    body.banned !== undefined;

  if (wantsAdminField) {
    const guarded = await requireAdmin();
    if ("error" in guarded) return guarded.error;

    const sets: string[] = [];
    const values: any[] = [];

    if (body.level !== undefined) {
      const v = Number(body.level);
      if (!Number.isFinite(v) || v < 1) {
        return NextResponse.json({ error: "Invalid level." }, { status: 400 });
      }
      values.push(v);
      sets.push(`level = $${values.length}`);
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) {
        return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      }
      if (body.role === "Owner" && !isOwner(guarded.user.role)) {
        return NextResponse.json(
          { error: "Only an Owner can grant Owner." },
          { status: 403 }
        );
      }
      values.push(body.role);
      sets.push(`role = $${values.length}`);
    }
    if (body.suspended !== undefined) {
      values.push(!!body.suspended);
      sets.push(`suspended = $${values.length}`);
    }
    if (body.banned !== undefined) {
      values.push(!!body.banned);
      sets.push(`banned = $${values.length}`);
    }

    if (!sets.length) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    values.push(id);
    const rows = await query(
      `update users set ${sets.join(", ")} where id = $${values.length}
       returning id, username, role, level, suspended, banned`,
      values
    );
    if (!rows[0]) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ user: rows[0] });
  }

  // Self bio edit
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;
  if (guarded.user.id !== id) {
    return NextResponse.json({ error: "You can only edit your own profile." }, { status: 403 });
  }

  const bio = (body.bio ?? "").slice(0, 300);
  const rows = await query(
    `update users set bio = $1 where id = $2 returning id, username, bio`,
    [bio, id]
  );
  return NextResponse.json({ user: rows[0] });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireAdmin();
  if ("error" in guarded) return guarded.error;

  if (guarded.user.id === id) {
    return NextResponse.json({ error: "You can't delete your own account here." }, { status: 400 });
  }

  try {
    // Clear nullable FK references so delete isn't blocked by past reviews/announcements.
    await query(`update submissions set reviewed_by = null where reviewed_by = $1`, [id]);
    await query(`update announcements set posted_by = null where posted_by = $1`, [id]);

    const rows = await query<{ id: string }>(`delete from users where id = $1 returning id`, [id]);
    if (!rows[0]) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete user." }, { status: 500 });
  }
}
