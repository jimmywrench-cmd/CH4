import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPermissionsForStatus, isValidStatus } from "@/lib/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null, permissions: {} });

  const permissions = isValidStatus(user.role)
    ? await getPermissionsForStatus(user.role)
    : {};

  return NextResponse.json({ user, permissions });
}
