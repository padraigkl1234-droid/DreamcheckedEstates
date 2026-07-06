# Push Notifications — Setup

INVICTUS sends push notifications for three things:

- **New task assignments** — the moment someone assigns/offers you a task.
- **Urgent compliance** — a daily alert when a compliance item is due within 7 days.
- **Daily summary** — an optional once-a-day roll-up of tasks due + urgent items.

Users turn these on per device in **Settings → Notifications**, and pick which
categories they want. The category preferences live on their profile in
Firestore (`users/{uid}.notifPrefs`) so the server respects them.

Everything is built and deployed with the app. There are **three one-time
configuration steps** in Firebase and Vercel to make it live.

---

## 1. Generate the Web Push (VAPID) key in Firebase

1. Firebase Console → your project (**dream-check-estates-1441-91c82**).
2. **Project settings** (gear icon) → **Cloud Messaging** tab.
3. Under **Web configuration → Web Push certificates**, click **Generate key
   pair** (if one isn't already there).
4. Copy the **key pair** value (a long `B…` string). This is a *public* key —
   it's safe to ship in the browser bundle.

While you're here, make sure the **Cloud Messaging API (V1)** is *enabled*
(same tab). It usually is by default.

## 2. Add the environment variables in Vercel

Vercel → the project → **Settings → Environment Variables**. Add these for
**Production** (and Preview if you test there), then **redeploy**:

| Name | Value | Notes |
|------|-------|-------|
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | *the VAPID key pair from step 1* | Public. Enables the client to register a device token. |
| `CRON_SECRET` | *a long random string you generate* | Protects the daily cron endpoint. Vercel Cron sends it automatically as `Authorization: Bearer <CRON_SECRET>`. |

> `FIREBASE_SERVICE_ACCOUNT_JSON` is already set (used by the Show Board
> webhook and team admin) — the push server reuses it to send messages. No new
> service-account setup is needed.

To generate a `CRON_SECRET`, any long random string works, e.g. run
`openssl rand -hex 32` locally, or use a password generator.

## 3. The daily cron

`vercel.json` already declares the schedule:

```json
{ "crons": [ { "path": "/api/cron/daily", "schedule": "0 7 * * *" } ] }
```

That runs `/api/cron/daily` every day at **07:00 UTC**. Vercel picks this up
automatically on the next deploy — no dashboard config needed. Change the
`schedule` (standard cron syntax, UTC) if you want a different time.

You can trigger it manually to test:

```
curl "https://<your-app>.vercel.app/api/cron/daily?secret=<CRON_SECRET>"
```

---

## How it fits together

| Piece | File |
|-------|------|
| Background handler (shows notifications when the tab is closed) | `public/firebase-messaging-sw.js` |
| Client: request permission, get/store/remove device token, foreground toast | `src/lib/messaging.ts` |
| Foreground listener + token refresh (mounted app-wide) | `src/components/PushListener.tsx` |
| Settings UI (enable toggle + category filters) | `src/app/settings/page.tsx` |
| Category prefs & defaults | `src/lib/teams.ts` (`NotifPrefs`, `notifEnabled`) |
| Send helper (multicast + dead-token pruning) | `src/lib/serverNotify.ts` |
| Task-assignment push endpoint | `src/app/api/notify/route.ts` |
| Daily compliance + summary cron | `src/app/api/cron/daily/route.ts` |
| Admin Cloud Messaging accessor | `src/lib/firebaseAdmin.ts` (`getAdminMessaging`) |

Device tokens are stored in `users/{uid}.fcmTokens` (an array — one entry per
device). Tokens the FCM backend reports as dead are pruned automatically when a
send fails, so the array self-cleans.

### Firestore rules

No rule changes are required beyond what's already in place: users write their
own `users/{uid}` doc (which now also holds `fcmTokens` and `notifPrefs`), and
the server (Admin SDK) bypasses rules entirely.

## Notes & limitations

- **iOS**: web push works only when the app is **installed to the Home Screen**
  (Add to Home Screen) on iOS 16.4+. In a normal Safari tab, iOS won't grant
  notification permission — the toggle will report "not supported".
- **Permission is per browser/device**: each device a user signs in on must
  enable notifications separately. That's why the toggle says "on this device".
- **Turning off** on a device removes that device's token (so it stops
  receiving pushes). The browser-level permission can't be revoked from code —
  users clear that in their browser settings if they want to.
- Notifications are **data-only** messages; the service worker renders them, so
  they look consistent and clicks deep-link into the right page
  (`?page=tasks`, `?page=compliance`).
