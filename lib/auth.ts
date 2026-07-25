import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { query, queryOne } from "./db";

const SESSION_COOKIE = "ch4_session";
const SESSION_TTL_DAYS = 30;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is not set (or too short). Set a random 32+ char string in .env.local."
    );
  }
  return new TextEncoder().encode(secret);
}

export type PublicUser = {
  id: string;
  username: string;
  role: "Member" | "Verified" | "Moderator" | "Admin" | "Owner";
  level: number;
  level_label: string | null;
  bio: string;
  avatar_seed: string;
  approved_count: number;
  rejected_count: number;
  suspended: boolean;
  banned: boolean;
  created_at: string;
};

const USER_FIELDS = `id, username, role, level, level_label, bio, avatar_seed, approved_count, rejected_count, suspended, banned, created_at`;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export class AuthError extends Error {}

// -------------------- signup --------------------
// Uniqueness is enforced twice on purpose:
// 1. Here, as a fast, friendly pre-check.
// 2. At the database via the `citext unique` constraint on
//    users.username in schema.sql — this is the real guarantee.
//    If two signups race, the DB unique-violation (23505) is
//    caught below and turned into the same friendly error, so
//    there is no window where two accounts can end up sharing
//    a username, case-insensitively.
export async function signUp(username: string, password: string): Promise<PublicUser> {
  const uname = username.trim();

  if (!USERNAME_RE.test(uname)) {
    throw new AuthError(
      "Username must be 3-20 characters, letters/numbers/underscore only."
    );
  }
  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters.");
  }

  const existing = await queryOne<{ id: string }>(
    `select id from users where username = $1`,
    [uname]
  );
  if (existing) {
    throw new AuthError("That username is already taken.");
  }

  const password_hash = await bcrypt.hash(password, 12);

  try {
    const user = await queryOne<PublicUser>(
      `insert into users (username, password_hash)
       values ($1, $2)
       returning ${USER_FIELDS}`,
      [uname, password_hash]
    );
    if (!user) throw new AuthError("Could not create account.");
    return user;
  } catch (err: any) {
    // 23505 = unique_violation — the DB constraint caught a race.
    if (err?.code === "23505") {
      throw new AuthError("That username is already taken.");
    }
    throw err;
  }
}

// -------------------- login --------------------
export async function logIn(username: string, password: string): Promise<PublicUser> {
  const uname = username.trim();

  const row = await queryOne<PublicUser & { password_hash: string }>(
    `select ${USER_FIELDS}, password_hash from users where username = $1`,
    [uname]
  );

  // Constant-shape error either way — don't reveal whether the
  // username exists.
  if (!row) {
    await bcrypt.compare(password, "$2a$12$invalidsaltinvalidsaltinvalidsO");
    throw new AuthError("Incorrect username or password.");
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    throw new AuthError("Incorrect username or password.");
  }
  if (row.banned) {
    throw new AuthError("This account has been banned.");
  }

  const { password_hash, ...user } = row;
  return user;
}

// -------------------- session issuance --------------------
export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const session = await queryOne<{ id: string }>(
    `insert into sessions (user_id, expires_at) values ($1, $2) returning id`,
    [userId, expiresAt.toISOString()]
  );
  if (!session) throw new Error("Could not create session.");

  const token = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      if (typeof payload.sid === "string") {
        await query(`delete from sessions where id = $1`, [payload.sid]);
      }
    } catch {
      // ignore — cookie will be cleared regardless
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

// -------------------- session verification --------------------
export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let sid: string;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sid !== "string") return null;
    sid = payload.sid;
  } catch {
    return null;
  }

  const row = await queryOne<PublicUser & { expires_at: string }>(
    `select u.${USER_FIELDS.split(", ").join(", u.")}, s.expires_at
     from sessions s
     join users u on u.id = s.user_id
     where s.id = $1`,
    [sid]
  );

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await query(`delete from sessions where id = $1`, [sid]);
    return null;
  }
  if (row.banned) return null;

  const { expires_at, ...user } = row;
  return user;
}

export function isStaff(role: PublicUser["role"]) {
  return role === "Moderator" || role === "Admin" || role === "Owner";
}
export function isAdmin(role: PublicUser["role"]) {
  return role === "Admin" || role === "Owner";
}
export function isOwner(role: PublicUser["role"]) {
  return role === "Owner";
}
