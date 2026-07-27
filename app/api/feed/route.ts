import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { createSignedPlaybackUrl } from "@/lib/storage";

// GET /api/feed?sort=trending|newest|oldest|liked|viewed&q=<search>&tag=<tag>&username=<name>
//
// Recommendation note: "trending" is a simple heuristic — recent
// likes and views weighted against age — not a personalized ML
// ranking. Pinned videos always sort first regardless of tab.
export async function GET(req: NextRequest) {
  const guarded = await requireUser();
  if ("error" in guarded) return guarded.error;

  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") || "trending";
  const q = searchParams.get("q")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const username = searchParams.get("username")?.trim();

  // Shorts is its own pool — only clips uploaded directly from a
  // profile (no review) show up here. Reviewed Submit-a-Clip queue
  // entries stay in the submission queue and never appear in Shorts.
  const conditions: string[] = [`s.status = 'approved'`, `not s.hidden`, `s.source = 'direct'`];
  const params: any[] = [guarded.user.id]; // $1 = current user, for my_vote

  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(s.title ilike $${params.length} or u.username ilike $${params.length})`);
  }
  if (tag) {
    params.push(tag);
    conditions.push(`$${params.length} = any(s.tags)`);
  }
  if (username) {
    params.push(`%${username}%`);
    conditions.push(`u.username ilike $${params.length}`);
  }

  const orderBy =
    {
      newest: "created_at desc",
      oldest: "created_at asc",
      liked: "likes desc, created_at desc",
      viewed: "view_count desc, created_at desc",
      trending:
        "(likes * 3 + view_count) / (extract(epoch from now() - created_at) / 3600 + 2) desc",
    }[sort] ?? "created_at desc";

  const rows = await query(
    `select * from (
       select
         s.id, s.title, s.description, s.video_path, s.tags, s.featured, s.pinned,
         s.comments_disabled, s.view_count, s.share_count, s.created_at,
         u.id as user_id, u.username, u.role, u.level, u.level_label,
         coalesce(
           (select json_agg(
              json_build_object(
                'id', cr.id, 'name', cr.name, 'color', cr.color, 'bold', cr.bold,
                'italic', cr.italic, 'underline', cr.underline,
                'strikethrough', cr.strikethrough, 'icon', cr.icon
              ) order by cr.sort_order
            )
            from user_custom_roles ucr
            join custom_roles cr on cr.id = ucr.role_id
            where ucr.user_id = u.id),
           '[]'::json
         ) as custom_roles,
         greatest(0, (select count(*) from video_likes vl where vl.submission_id = s.id and vl.value = 1)::int + s.like_offset) as likes,
         greatest(0, (select count(*) from video_likes vl where vl.submission_id = s.id and vl.value = -1)::int + s.dislike_offset) as dislikes,
         (select count(*) from video_comments vc where vc.submission_id = s.id and not vc.deleted)::int as comment_count,
         (select vl.value from video_likes vl where vl.submission_id = s.id and vl.user_id = $1) as my_vote,
         (exists(
            select 1 from follows f where f.follower_id = $1 and f.following_id = u.id
          )) as is_following
       from submissions s
       join users u on u.id = s.user_id
       where ${conditions.join(" and ")}
     ) feed
     order by feed.pinned desc, ${orderBy}
     limit 60`,
    params
  );

  const withUrls = await Promise.all(
    rows.map(async (row: any) => {
      if (!row.video_path) return row;
      try {
        const video_url = await createSignedPlaybackUrl(row.video_path);
        return { ...row, video_url };
      } catch (err) {
        console.error("Failed to sign playback URL for", row.video_path, err);
        return row;
      }
    })
  );

  return NextResponse.json({ videos: withUrls });
}
