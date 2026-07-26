import "server-only";
import { query } from "./db";
import type { PublicUser } from "./auth";
import {
  STATUSES,
  PERMISSIONS,
  DEFAULT_MATRIX,
  IMMUTABLE_STATUSES,
  isValidStatus,
  isValidPermission,
  type Status,
  type Permission,
  type PermissionMatrix,
} from "./permissions-shared";

// -------------------- in-process cache --------------------
// The matrix is read on essentially every request (guard checks,
// /api/auth/me). It changes rarely (only when Owner/Co-Owner edits
// it), so cache it in memory and invalidate on write. Mirrors the
// pattern already used for the pg Pool singleton in lib/db.ts.
declare global {
  // eslint-disable-next-line no-var
  var _ch4PermCache: { matrix: PermissionMatrix; loadedAt: number } | undefined;
}

const CACHE_TTL_MS = 30_000;

async function loadMatrixFromDb(): Promise<PermissionMatrix> {
  const rows = await query<{ status: string; permission: string; enabled: boolean }>(
    `select status, permission, enabled from status_permissions`
  );

  // Start from defaults so any row missing from the DB (e.g. a
  // permission added after the table was seeded) still has a value.
  const matrix: PermissionMatrix = JSON.parse(JSON.stringify(DEFAULT_MATRIX));

  for (const row of rows) {
    if (!isValidStatus(row.status) || !isValidPermission(row.permission)) continue;
    matrix[row.status][row.permission] = row.enabled;
  }

  // Owner is always all-true regardless of what's stored — belt and
  // suspenders on top of the DB trigger / API-level guard.
  for (const status of IMMUTABLE_STATUSES) {
    for (const perm of PERMISSIONS) matrix[status][perm] = true;
  }

  return matrix;
}

export async function getPermissionMatrix(forceRefresh = false): Promise<PermissionMatrix> {
  const cached = global._ch4PermCache;
  const fresh = cached && Date.now() - cached.loadedAt < CACHE_TTL_MS;
  if (!forceRefresh && fresh) return cached.matrix;

  const matrix = await loadMatrixFromDb();
  global._ch4PermCache = { matrix, loadedAt: Date.now() };
  return matrix;
}

function invalidateCache() {
  global._ch4PermCache = undefined;
}

export async function getPermissionsForStatus(
  status: Status
): Promise<Record<Permission, boolean>> {
  const matrix = await getPermissionMatrix();
  return matrix[status];
}

// Owner always passes every check, even if the DB row were somehow
// wrong — this is the hard "cannot have permissions removed" rule
// from the spec, enforced independent of the stored matrix.
export async function hasPermission(
  user: Pick<PublicUser, "role">,
  permission: Permission
): Promise<boolean> {
  const status = user.role as Status;
  if (status === "Owner") return true;
  if (!isValidStatus(status)) return false;
  const matrix = await getPermissionMatrix();
  return !!matrix[status]?.[permission];
}

export async function setPermission(
  status: Status,
  permission: Permission,
  enabled: boolean
): Promise<void> {
  if (IMMUTABLE_STATUSES.includes(status)) {
    throw new Error("Owner permissions can't be changed.");
  }
  await query(
    `insert into status_permissions (status, permission, enabled)
     values ($1, $2, $3)
     on conflict (status, permission) do update set enabled = excluded.enabled`,
    [status, permission, enabled]
  );
  invalidateCache();
}

export async function resetPermissionsToDefault(): Promise<void> {
  await query(`delete from status_permissions`);

  const values: string[] = [];
  const params: any[] = [];
  let i = 1;
  for (const status of STATUSES) {
    for (const perm of PERMISSIONS) {
      values.push(`($${i++}, $${i++}, $${i++})`);
      params.push(status, perm, DEFAULT_MATRIX[status][perm]);
    }
  }

  await query(
    `insert into status_permissions (status, permission, enabled) values ${values.join(", ")}`,
    params
  );
  invalidateCache();
}

export {
  STATUSES,
  PERMISSIONS,
  PERMISSION_LABELS,
  IMMUTABLE_STATUSES,
  isValidStatus,
  isValidPermission,
} from "./permissions-shared";
export type { Status, Permission, PermissionMatrix } from "./permissions-shared";
