import { NextResponse } from "next/server";
import { requireOwnerOrCoOwner } from "@/lib/guard";
import { getPermissionMatrix, resetPermissionsToDefault } from "@/lib/permissions";

export async function POST() {
  const guarded = await requireOwnerOrCoOwner();
  if ("error" in guarded) return guarded.error;

  await resetPermissionsToDefault();
  const matrix = await getPermissionMatrix(true);
  return NextResponse.json({ matrix });
}
