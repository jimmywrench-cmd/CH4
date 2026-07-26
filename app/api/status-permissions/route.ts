import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrCoOwner } from "@/lib/guard";
import {
  getPermissionMatrix,
  setPermission,
  isValidStatus,
  isValidPermission,
  IMMUTABLE_STATUSES,
} from "@/lib/permissions";

// GET — full matrix. Owner/Co-Owner only (this is staff-configuration
// data, not something to leak to regular users).
export async function GET() {
  const guarded = await requireOwnerOrCoOwner();
  if ("error" in guarded) return guarded.error;

  const matrix = await getPermissionMatrix(true);
  return NextResponse.json({ matrix });
}

// PATCH — toggle a single (status, permission) cell.
export async function PATCH(req: NextRequest) {
  const guarded = await requireOwnerOrCoOwner();
  if ("error" in guarded) return guarded.error;

  let body: { status?: string; permission?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { status, permission, enabled } = body;
  if (!status || !permission || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "status, permission, and enabled are required." },
      { status: 400 }
    );
  }
  if (!isValidStatus(status) || !isValidPermission(permission)) {
    return NextResponse.json({ error: "Unknown status or permission." }, { status: 400 });
  }
  if (IMMUTABLE_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Owner's permissions can't be changed." },
      { status: 400 }
    );
  }

  await setPermission(status, permission, enabled);
  const matrix = await getPermissionMatrix(true);
  return NextResponse.json({ matrix });
}
