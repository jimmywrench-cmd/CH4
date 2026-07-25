import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, isStaff, isAdmin, isOwner, PublicUser } from "./auth";

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
