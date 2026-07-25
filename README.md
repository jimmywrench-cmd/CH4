# CH4 — Channel4 Ops Network

Real backend. No mock data, no fake accounts.

## What's real here

- **Accounts**: username + password only, no email. Usernames are
  case-insensitively unique at the database level (`citext unique`
  on `users.username`) — two accounts can never share a name, even
  differing only by case. Passwords are bcrypt-hashed
  server-side; the database never sees a plaintext password.
- **Sessions**: signed, httpOnly cookies backed by real session
  rows in Postgres (so you can revoke a session server-side, not
  just client-side).
- **Every screen** — submissions, approvals, leveling, chat,
  leaderboard, ranks, announcements, notifications, user
  moderation — reads and writes real rows through API routes that
  enforce role checks **server-side**, not just hidden buttons in
  the UI.
- **Video uploads** go straight to a private Supabase Storage
  bucket via short-lived signed URLs — the browser never sees your
  service role key.

## One-time setup

1. Create a free Supabase project at supabase.com.
2. In the Supabase SQL editor, run `supabase/schema.sql` — this
   creates every table, the unique-username constraint, RLS
   policies, and the atomic approve/reject functions.
3. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
     (Supabase dashboard -> Settings -> API)
   - `DATABASE_URL` (Settings -> Database -> Connection string -> URI)
   - `SESSION_SECRET` -- any random 32+ character string
     (`openssl rand -base64 32`)
4. Install and run:
   ```
   npm install
   npm run dev
   ```
5. Open http://localhost:3000, click "Create one", pick a
   username and password. First account you make is a normal
   Member -- promote yourself to Owner directly in the Supabase
   table editor (`users` table, `role` column) to unlock the
   dashboard.

## Deploying for free

- **App**: push this repo to GitHub, import it on Vercel
  (vercel.com) or Cloudflare Pages -- both have generous free
  tiers. Set the same env vars in the host's dashboard.
- **Database + storage**: Supabase's free tier (500MB DB, 1GB
  storage) covers a community-sized userbase. If clip storage
  fills up, swap the bucket for Cloudflare R2 (10GB free, no
  egress fees) -- only `lib/storage.ts` needs to change.

## Project layout

- `lib/auth.ts` -- signup/login/session core
- `lib/db.ts` -- direct Postgres connection (server-only)
- `lib/guard.ts` -- role-gating helpers used by every API route
- `lib/ranks.ts` -- shared rank-tier math
- `lib/storage.ts` -- signed upload/playback URLs
- `app/api/**` -- every real endpoint
- `components/**` -- the actual UI, ported 1:1 from the original
  design (dark glass, blue/purple glow) but wired to real data
- `supabase/schema.sql` -- run this first, in full
