// Local development fixture for the hotel module — EMULATOR ONLY.
//
// Creates a small test hotel team so the hub can be clicked through locally.
// It is not the sales demo (that's a separate, later piece of work).
//
//   1. firebase emulators:start
//   2. node scripts/hotel-dev-fixture.mjs            # team + rooms + today's jobs
//   3. sign in at http://localhost:3000 with any fake Google account and
//      enter the code it prints
//   4. node scripts/hotel-dev-fixture.mjs --role you@example.com=manager
//      (roles: manager | housekeeper | maintenance)
//
// Refuses to run unless FIRESTORE_EMULATOR_HOST is set, so it can never
// touch production.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST is not set (this script is emulator-only).');
  process.exit(1);
}

const config = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
const app = initializeApp({ projectId: 'demo-invictus' });
const db = getFirestore(app, config.firestoreDatabaseId);

const TEAM_ID = 'test-hotel';
const CODE = 'HOTEL1';
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

async function setRole(email, role) {
  const users = await db.collection('users').where('email', '==', email).get();
  if (users.empty) throw new Error(`No user with email ${email} — sign in once first.`);
  const u = users.docs[0];
  await u.ref.set({ teamId: TEAM_ID }, { merge: true });
  await db.collection('hotelStaff').doc(`${TEAM_ID}_${u.id}`).set(
    { teamId: TEAM_ID, uid: u.id, name: u.data().name || email, role, active: true, createdAt: Date.now() },
    { merge: true }
  );
  console.log(`${email} → ${role}`);
}

const roleArgs = process.argv.flatMap((a, i, all) => (a === '--role' ? [all[i + 1]] : []));
if (roleArgs.length) {
  for (const arg of roleArgs) {
    const [email, role] = arg.split('=');
    await setRole(email, role);
  }
  process.exit(0);
}

await db.collection('teams').doc(TEAM_ID).set(
  { name: 'Test Hotel', referralCode: CODE, createdAt: Date.now(), module: 'hotel' },
  { merge: true }
);

const roomsSnap = await db.collection('hotelRooms').where('teamId', '==', TEAM_ID).get();
let rooms = roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
if (!rooms.length) {
  const types = ['Single', 'Double', 'Twin', 'Double', 'Family', 'Accessible'];
  const batch = db.batch();
  for (const floor of [1, 2]) {
    for (let n = 1; n <= 6; n++) {
      const ref = db.collection('hotelRooms').doc();
      const room = {
        teamId: TEAM_ID,
        number: `${floor}0${n}`,
        floor,
        type: types[n - 1],
        status: 'dirty',
        statusAt: Date.now(),
        lastCleanedAt: null,
        lastOccupiedOn: null,
        notes: '',
        active: true,
        externalRef: null,
        createdAt: Date.now(),
      };
      batch.set(ref, room);
      rooms.push({ id: ref.id, ...room });
    }
  }
  await batch.commit();
}

console.log(`Test hotel ready. Team code: ${CODE} (${rooms.length} rooms, today ${today}).`);
process.exit(0);
