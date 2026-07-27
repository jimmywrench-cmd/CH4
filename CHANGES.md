# CH4 update — Shorts video feed

## How to apply
1. Copy every file listed below into your `ch4` project at the matching
   paths (overwrite existing ones).
2. Run `supabase/migration_6.sql` **once** in the Supabase SQL Editor.
   Safe to re-run.
3. `npm install && npm run build` to confirm, then redeploy.

## What's new

**Full-screen vertical clip feed ("Shorts")**
- New sidebar nav item, between Home and Submit Clip.
- Swipe (touch) / scroll wheel (desktop) / ↑↓ arrow keys to move between
  clips. Space to play/pause, `m` to mute, ←/→ to skip 5s, `f` for
  fullscreen, double-click/double-tap to like.
- Autoplays the active clip, pauses everything else; preloads the next
  2 clips so scrolling feels instant without decoding the whole feed at
  once.
- Progress bar, volume slider, fullscreen toggle. Volume/mute prefs and
  per-video resume position are remembered locally (device-level, via
  localStorage) — no new DB table needed for that part.
- Right-side action bar: like/dislike, comment, share (copies a link),
  report, copy-link — each with a live count and a tap animation.
- Bottom-left overlay: avatar, username, status badge, any custom role
  badges, level/rank, title, description, upload date, view count.
- Sort tabs: Trending, Newest, Oldest, Most Liked, Most Viewed. A search
  panel filters by title/username and by tag. "Trending" is a simple
  recency-weighted heuristic (recent likes + views vs. age), not a
  personalized recommender.
- Comments slide-up panel: view, reply, like, delete your own (or any,
  if you have `manage_shorts`), sort Top/Newest/Oldest.
- Staff moderation menu (gear icon, only shown if you have the new
  `manage_shorts` permission): Feature, Pin, Hide, Remove, and toggle
  comments on a specific clip.
- Reports staff can review live in `/api/feed/reports` (reuses the
  existing `manage_reports` permission) — no UI panel shipped yet for
  browsing them, just the endpoint; wire it into the dashboard if you
  want a page for it.
- Per-video analytics endpoint (`/api/feed/[id]/analytics`, gated on
  the existing `view_analytics` permission): views, total/avg watch
  time, avg watch %, likes, dislikes, comments, shares, reports.

**New files**
- `supabase/migration_6.sql`
- `app/api/feed/route.ts`
- `app/api/feed/[id]/like/route.ts`
- `app/api/feed/[id]/view/route.ts`
- `app/api/feed/[id]/share/route.ts`
- `app/api/feed/[id]/report/route.ts`
- `app/api/feed/[id]/moderate/route.ts`
- `app/api/feed/[id]/analytics/route.ts`
- `app/api/feed/[id]/comments/route.ts`
- `app/api/feed/[id]/comments/[commentId]/route.ts`
- `app/api/feed/[id]/comments/[commentId]/like/route.ts`
- `app/api/feed/reports/route.ts`
- `app/api/feed/reports/[id]/route.ts`
- `components/views/ShortsView.tsx`

**Changed files**
- `lib/permissions-shared.ts` — added `manage_shorts` permission + label.
- `components/AppShell.tsx` — new "Shorts" nav item and view route.
- `app/globals.css` — all Shorts styling appended at the end of the file.

## Approved clips show up automatically
Nothing extra needed — the feed just queries `submissions` where
`status = 'approved' and not hidden`, so anything that clears the
existing Submit Clip review flow appears here immediately.

## Simplifications made on purpose
- **Recommendations**: "Trending" sort is a heuristic formula, not
  personalized ML ranking — accurate to the spirit of "prioritize new /
  trending / highly-liked / recently-approved" without standing up a
  recommendation service.
- **Resume position + volume memory**: stored in the browser
  (`localStorage`), not the database. Covers "leave and come back on
  the same device," which is the common case; say the word if you want
  it synced server-side across devices instead (needs one more small
  table).
- **Infinite scroll**: the feed loads the top 60 matching clips per
  sort/filter combination rather than paginating indefinitely. Bump the
  `limit 60` in `app/api/feed/route.ts` or add real pagination if your
  library grows past that.
