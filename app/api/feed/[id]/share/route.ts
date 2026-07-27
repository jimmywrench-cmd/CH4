import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/feed/[id]/share — called from both the Share button
// and Copy Link, so "shares" tracks intent-to-share, not just one
// mechanism.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const rows = await query<{ share_count: number }>(
    `update submissions set share_count = share_count + 1 where id = $1 returning share_count`,
    [id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  return NextResponse.json({ share_count: rows[0].share_count });
}
