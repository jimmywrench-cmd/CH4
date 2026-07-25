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
    username?: string;
    level?: string | number;
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
       returning id, username, role, level, level_label, suspended, banned`,
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
  const guarded = await requireAdmin();
  if ("error" in guarded) return guarded.error;

  if (guarded.user.id === id) {
    return NextResponse.json({ error: "You can't delete your own account here." }, { status: 400 });
  }

  await query(`delete from users where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
