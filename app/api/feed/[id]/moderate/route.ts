import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/guard";

const ACTIONS: Record<string, { column: string; value: boolean } | "remove"> = {
  feature: { column: "featured", value: true },
  unfeature: { column: "featured", value: false },
  pin: { column: "pinned", value: true },
  unpin: { column: "pinned", value: false },
  hide: { column: "hidden", value: true },
  unhide: { column: "hidden", value: false },
  disable_comments: { column: "comments_disabled", value: true },
  enable_comments: { column: "comments_disabled", value: false },
  remove: "remove",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requirePermission("manage_shorts");
  if ("error" in guarded) return guarded.error;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = body.action ? ACTIONS[body.action] : undefined;
  if (!action) {
    return NextResponse.json({ error: "Unknown moderation action." }, { status: 400 });
  }

  if (action === "remove") {
    await query(`delete from submissions where id = $1`, [id]);
    return NextResponse.json({ ok: true, removed: true });
  }

  const rows = await query(
    `update submissions set ${action.column} = $1 where id = $2 returning id, ${action.column}`,
    [action.value, id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  return NextResponse.json({ ok: true, video: rows[0] });
}
