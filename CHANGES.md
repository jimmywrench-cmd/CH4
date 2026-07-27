# CH4 update — delete announcements, donate button

## How to apply
Copy these files into your `ch4` project at the matching paths (overwrite
existing ones). No new migration needed — nothing here touches the DB schema
beyond tables that already exist.

## What changed

**Delete announcements**
- `app/api/announcements/[id]/route.ts` (new) — DELETE endpoint, staff-only
  (same permission level as posting one).
- `components/views/AnnouncementsView.tsx` — adds a 🗑 delete button on each
  announcement card, visible to staff only.

**Donate button (top-left, small)**
- `components/AppShell.tsx` — adds a small "💛 Donate" pill button right
  under the CH4 logo in the sidebar, and wires up a new "donate" view.
- `components/views/DonateView.tsx` (new) — the page it opens. Shows a
  "Donate" button that links to whatever URL you set in the
  `NEXT_PUBLIC_DONATE_URL` environment variable (a Ko-fi, PayPal, or Stripe
  payment link work well). Until you set that variable, it shows a note
  telling you it's not configured yet instead of a dead link.
- `app/globals.css` — styling for the small pill button (`.donate-pill`).

## To activate the donate link
Add an environment variable in Vercel (Project Settings → Environment
Variables):
```
NEXT_PUBLIC_DONATE_URL=https://ko-fi.com/yourpage
```
(or your PayPal.me / Stripe link). Redeploy after adding it.
