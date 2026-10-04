# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Hotel Operations module

A self-contained hotel hub for independent hotels (10–60 rooms), switched on
per team. A hotel team that signs in lands on `/hotel` and sees only hotel
navigation; every other team sees exactly what it always has.

| Route | Who | What |
|---|---|---|
| `/hotel/board` | Manager | Today board: every room by floor, coloured by status, live |
| `/hotel/assign` | Manager | Start-of-day plan, allocation (single or bulk by floor), workload |
| `/hotel/my-tasks` | Housekeeper | Today's rooms, Start → checklist → Finish, refused / DND |
| `/hotel/report` | Everyone | Report a fault with photos; optionally take the room out of order |
| `/hotel/maintenance` | Maintenance, manager | Fault queue: assign, progress, notes, after photo, close |
| `/hotel/compliance` | Maintenance, manager | Recurring checks, UK starter set, log with PDF / CSV export |
| `/hotel/summary` | Manager | End-of-day summary, PDF export |
| `/hotel/settings` | Manager | Rooms, staff roles, checklists, time estimates, fault categories |

Code: `src/app/hotel/*`, `src/components/hotel/*`, `src/lib/hotel/*` (the data
model is documented at the top of `src/lib/hotel/types.ts`).

### Enabling it for a team

1. **Deploy the Firestore rules first.** `firestore.rules` gains the `hotel*`
   blocks (existing blocks are unchanged). Without them every hotel read and
   write is denied.
2. In the **master console** (`/master`), create the team (or pick an
   existing one) and switch **Module → Hotel hub** on. Dreamland can't be
   switched. Under the hood this sets `teams/{id}.module = 'hotel'`.
3. **Staff join with the team's code**, exactly as today: sign in with Google,
   enter the code. Everyone joining a hotel team starts as a *housekeeper*.
4. **The first manager:** make them a **commander** of the team (the existing
   rank control). A commander is always a hotel manager. From then on, managers
   set everyone else's role in **Settings → Staff**.
5. On a manager's first visit the hub writes default settings and checklists.
   Rooms are added in **Settings → Rooms**. The UK compliance starter set is
   one tap on **Compliance**.

Hotel roles (`manager` / `housekeeper` / `maintenance`) live in
`hotelStaff/{teamId}_{uid}`, separate from the estates rank ladder, and only a
hotel manager can change them.

### Storage rules

Photos go to `hotel/{teamId}/…` in Firebase Storage. Production Storage rules
are managed in the console. Merge the `/hotel` block from `storage.rules` into
them rather than deploying that file over the top. Cross-service rules can't
reach INVICTUS's named Firestore database, so the Storage rules can't check
the caller's team. Hotel photos are limited to signed-in users, images only,
under 10 MB, at an unguessable path, and are only linked from team-scoped
Firestore documents.

### Running it locally

Everything runs against the Firebase Emulator Suite, under the `demo-invictus`
project id, which the emulators guarantee can never reach a real project:

```bash
npx firebase emulators:start --only auth,firestore,storage
node scripts/hotel-dev-fixture.mjs          # with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
NEXT_PUBLIC_USE_EMULATORS=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
  npm run dev
```

The fixture creates a "Test Hotel" with 12 rooms and prints its team code.
Sign in, join with the code, then give yourself a role with
`node scripts/hotel-dev-fixture.mjs --role you@example.com=manager`. It refuses
to run unless `FIRESTORE_EMULATOR_HOST` is set. `NEXT_PUBLIC_USE_EMULATORS` is
compiled out of production builds.

### Tests

`npm test` starts the Firestore emulator and runs:

- `tests/hotel-rules.test.ts`: cross-team isolation (one hotel can't read,
  list or write another's data, and estates teams and signed-out visitors
  can't either), role limits within a hotel, append-only history, and the
  exact writes the screens make.
- `tests/hotel-logic.test.ts`: task and fault ordering, due dates, the
  water-flush room list, water-temperature limits and the end-of-day maths.

### Offline

Housekeeping screens keep working with no signal. Firestore's persistent
cache queues every write, and fault photos are saved to an IndexedDB outbox
(`src/lib/hotel/photos.ts`) and uploaded when the connection returns. A banner
shows when the device is offline or photos are waiting. Compliance photos
need a connection.

### Deliberately left out

- **Booking-system integration.** Room status is set by hand. Rooms carry an
  `externalRef` and every status change records a `source`, ready for an
  importer.
- **Scheduled end-of-day email.** `buildEndOfDaySummary()` and
  `summarySections()` (`src/lib/hotel/summary.ts`) are pure and server-safe,
  so a cron route and an automation handler can reuse them.
- **Demo hotel seed and reset.** Deferred. `scripts/hotel-dev-fixture.mjs` is
  a minimal local fixture, not the sales demo.
- **Translations.** Hotel screens are English only.
- **Deleting a team's hotel data.** The master console's "delete team + data"
  doesn't clear `hotel*` collections yet.
- **Several teams per person.** A person still belongs to one team at a time.
