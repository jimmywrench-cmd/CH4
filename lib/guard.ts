import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, isStaff, isAdmin, isOwner, isOwnerOrCoOwner, PublicUser } from "./auth";
import { hasPermission, type Permission } from "./permissions";

export async function requireUser(): Promise<
  { user: PublicUser } | { error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }
  return { user };
}

export async function requireStaff(): Promise<
  { user: PublicUser } | { error: NextResponse }
> {
  const result = await requireUser();
  if ("error" in result) return result;
  if (!isStaff(result.user.role)) {
    return { error: NextResponse.json({ error: "Staff access required." }, { status: 403 }) };
  }
  return result;
}

export async function requireAdmin(): Promise<
  { user: PublicUser } | { error: NextResponse }
> {
  const result = await requireUser();
  if ("error" in result) return result;
  if (!isAdmin(result.user.role)) {
    return { error: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return result;
}

export async function requireOwner(): Promise<
  { user: PublicUser } | { error: NextResponse }
> {
  const result = await requireUser();
  if ("error" in result) return result;
  if (!isOwner(result.user.role)) {
    return { error: NextResponse.json({ error: "Owner access required." }, { status: 403 }) };
  }
  return result;
}

export async function requireOwnerOrCoOwner(): Promise<
  { user: PublicUser } | { error: NextResponse }
> {
  const result = await requireUser();
  if ("error" in result) return result;
  if (!isOwnerOrCoOwner(result.user.role)) {
    return {
      error: NextResponse.json({ error: "Owner or Co-Owner access required." }, { status: 403 }),
    };
  }
  return result;
}

// Gate an action on a specific toggleable Status Permission rather
// than a hardcoded role tier. Owner always passes (see
// lib/permissions.ts::hasPermission).
export async function requirePermission(
  permission: Permission
): Promise<{ user: PublicUser } | { error: NextResponse }> {
  const result = await requireUser();
  if ("error" in result) return result;
  const allowed = await hasPermission(result.user, permission);
  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: "You don't have permission to do that." },
        { status: 403 }
      ),
    };
  }
  return result;
}
