import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { createSignedUploadUrl } from "@/lib/storage";

const ALLOWED_EXT = new Set(["mp4", "mov", "webm", "mkv"]);

export async function POST(req: NextRequest) {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  let body: { filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const filename = body.filename || "";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Only mp4, mov, webm, or mkv clips are allowed." },
      { status: 400 }
    );
  }

  const path = `${guarded.user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  try {
    const signed = await createSignedUploadUrl(path);
    return NextResponse.json(signed);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });
  }
}
