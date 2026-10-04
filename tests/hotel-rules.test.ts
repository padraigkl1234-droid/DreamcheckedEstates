// Proves the hotel module's Firestore rules against the emulator:
//   1. cross-team isolation — a hotel can never read or write another
//      hotel's data, and an estates team can't see any of it;
//   2. role limits within a hotel (housekeeper / maintenance / manager);
//   3. the history collections are append-only.
//
// Run with `npm test` (starts the Firestore emulator for the run).

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, setLogLevel, updateDoc, where } from 'firebase/firestore';

// Denied writes are the point of most of these tests — don't log each one.
setLogLevel('silent');

const A = 'hotelA';
const B = 'hotelB';
const TODAY = '2026-10-04';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-invictus',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

// Two hotels with the same shape of data, plus an estates team.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const users: [string, string, string?][] = [
      ['aManager', A],
      ['aHk', A],
      ['aHk2', A],
      ['aMaint', A],
      ['aNoRole', A],
      ['aCommander', A, 'commander'],
      ['bManager', B],
      ['bHk', B],
      ['estates', 'dreamland', 'commander'],
    ];
    for (const [uid, teamId, rank] of users) {
      await setDoc(doc(db, 'users', uid), { name: uid, teamId, ...(rank ? { rank } : {}) });
    }
    const staff: [string, string, string][] = [
      ['aManager', A, 'manager'],
      ['aHk', A, 'housekeeper'],
      ['aHk2', A, 'housekeeper'],
      ['aMaint', A, 'maintenance'],
      ['bManager', B, 'manager'],
      ['bHk', B, 'housekeeper'],
    ];
    for (const [uid, teamId, role] of staff) {
      await setDoc(doc(db, 'hotelStaff', `${teamId}_${uid}`), { teamId, uid, name: uid, role, active: true, createdAt: 1 });
    }
    for (const t of [A, B]) {
      await setDoc(doc(db, 'hotelSettings', t), { teamId: t, minutes: { departure: 30, stayover: 15, deep: 60 } });
      await setDoc(doc(db, 'hotelRooms', `${t}-101`), {
        teamId: t, number: '101', floor: 1, type: 'Double', status: 'dirty', statusAt: 1, active: true, createdAt: 1,
      });
      const hk = t === A ? 'aHk' : 'bHk';
      await setDoc(doc(db, 'hotelAssignments', `${t}_${TODAY}_${t}-101`), {
        teamId: t, date: TODAY, roomId: `${t}-101`, roomNumber: '101', floor: 1, cleanType: 'departure',
        assigneeUid: hk, assigneeName: hk, urgent: false, outcome: 'pending', checklist: {},
        createdAt: 1, updatedAt: 1, updatedBy: 'seed', updatedByName: 'seed',
      });
      await setDoc(doc(db, 'hotelChecklistTemplates', `${t}_departure`), { teamId: t, cleanType: 'departure', items: [] });
      await setDoc(doc(db, 'hotelRoomEvents', `${t}-ev1`), { teamId: t, roomId: `${t}-101`, from: null, to: 'dirty', at: 1, byUid: 'seed' });
      await setDoc(doc(db, 'hotelFaults', `${t}-f1`), {
        teamId: t, roomId: `${t}-101`, category: 'Plumbing', priority: 'high', status: 'open', note: 'Leak',
        photos: [], afterPhotos: [], pendingPhotos: 0, reportedBy: t === A ? 'aHk' : 'bHk', createdAt: 1, updatedAt: 1,
      });
      await setDoc(doc(db, 'hotelFaultUpdates', `${t}-fu1`), { teamId: t, faultId: `${t}-f1`, kind: 'created', byUid: 'seed', at: 1 });
      await setDoc(doc(db, 'hotelComplianceChecks', `${t}-c1`), {
        teamId: t, name: 'Fire alarm test', kind: 'standard', frequency: 'weekly', nextDue: TODAY, active: true, createdAt: 1,
      });
      await setDoc(doc(db, 'hotelComplianceLogs', `${t}-cl1`), { teamId: t, checkId: `${t}-c1`, result: 'pass', byUid: 'seed', at: 1 });
      await setDoc(doc(db, 'hotelAudit', `${t}-au1`), { teamId: t, action: 'seed', byUid: 'seed', at: 1 });
    }
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

// Every hotel collection, with a doc that belongs to hotel A.
const A_DOCS: [string, string][] = [
  ['hotelStaff', `${A}_aHk`],
  ['hotelSettings', A],
  ['hotelRooms', `${A}-101`],
  ['hotelRoomEvents', `${A}-ev1`],
  ['hotelAssignments', `${A}_${TODAY}_${A}-101`],
  ['hotelChecklistTemplates', `${A}_departure`],
  ['hotelFaults', `${A}-f1`],
  ['hotelFaultUpdates', `${A}-fu1`],
  ['hotelComplianceChecks', `${A}-c1`],
  ['hotelComplianceLogs', `${A}-cl1`],
  ['hotelAudit', `${A}-au1`],
];

describe('cross-team isolation', () => {
  it("hotel A's manager can read every hotel A document (control)", async () => {
    const db = as('aManager');
    for (const [coll, id] of A_DOCS) await assertSucceeds(getDoc(doc(db, coll, id)));
  });

  it("hotel B's manager cannot read any hotel A document", async () => {
    const db = as('bManager');
    for (const [coll, id] of A_DOCS) await assertFails(getDoc(doc(db, coll, id)));
  });

  it("hotel B's manager cannot list hotel A's collections", async () => {
    const db = as('bManager');
    for (const [coll] of A_DOCS) {
      if (coll === 'hotelSettings') continue; // keyed by team id, covered by get above
      await assertFails(getDocs(query(collection(db, coll), where('teamId', '==', A))));
    }
  });

  it('an estates commander cannot read any hotel A document', async () => {
    const db = as('estates');
    for (const [coll, id] of A_DOCS) await assertFails(getDoc(doc(db, coll, id)));
  });

  it('a signed-out visitor cannot read anything', async () => {
    const db = env.unauthenticatedContext().firestore();
    for (const [coll, id] of A_DOCS) await assertFails(getDoc(doc(db, coll, id)));
  });

  it("hotel B's manager cannot write into hotel A", async () => {
    const db = as('bManager');
    await assertFails(setDoc(doc(db, 'hotelRooms', 'evil'), { teamId: A, number: '999', floor: 9, type: 'x', status: 'dirty', statusAt: 1, active: true, createdAt: 1 }));
    await assertFails(updateDoc(doc(db, 'hotelRooms', `${A}-101`), { status: 'inspected' }));
    await assertFails(deleteDoc(doc(db, 'hotelRooms', `${A}-101`)));
    await assertFails(setDoc(doc(db, 'hotelSettings', A), { teamId: A, minutes: {} }));
    await assertFails(setDoc(doc(db, 'hotelStaff', `${A}_bManager`), { teamId: A, uid: 'bManager', name: 'x', role: 'manager', active: true }));
    await assertFails(setDoc(doc(db, 'hotelFaults', 'evil'), { teamId: A, reportedBy: 'bManager', status: 'open' }));
    await assertFails(setDoc(doc(db, 'hotelRoomEvents', 'evil'), { teamId: A, byUid: 'bManager', to: 'dirty' }));
    await assertFails(
      setDoc(doc(db, 'hotelAssignments', `${A}_${TODAY}_${A}-101`), { teamId: A, date: TODAY, roomId: `${A}-101` })
    );
  });

  it('cannot move a document from one hotel to another', async () => {
    const db = as('aManager');
    await assertFails(updateDoc(doc(db, 'hotelRooms', `${A}-101`), { teamId: B }));
  });

  it("a manager cannot give a role to someone outside their team", async () => {
    const db = as('aManager');
    await assertFails(setDoc(doc(db, 'hotelStaff', `${A}_bHk`), { teamId: A, uid: 'bHk', name: 'x', role: 'housekeeper', active: true, createdAt: 1 }));
  });
});

describe('roles within a hotel', () => {
  it('someone on the team with no hotel role sees nothing', async () => {
    const db = as('aNoRole');
    await assertFails(getDoc(doc(db, 'hotelRooms', `${A}-101`)));
    await assertFails(getDocs(query(collection(db, 'hotelRooms'), where('teamId', '==', A))));
  });

  it('a team commander is treated as a hotel manager', async () => {
    const db = as('aCommander');
    await assertSucceeds(getDocs(query(collection(db, 'hotelAssignments'), where('teamId', '==', A))));
    await assertSucceeds(setDoc(doc(db, 'hotelStaff', `${A}_aNoRole`), { teamId: A, uid: 'aNoRole', name: 'x', role: 'housekeeper', active: true, createdAt: 1 }));
  });

  it('a housekeeper sees only their own assignments', async () => {
    const mine = as('aHk');
    await assertSucceeds(getDoc(doc(mine, 'hotelAssignments', `${A}_${TODAY}_${A}-101`)));
    await assertSucceeds(
      getDocs(query(collection(mine, 'hotelAssignments'), where('teamId', '==', A), where('date', '==', TODAY), where('assigneeUid', '==', 'aHk')))
    );
    await assertFails(getDocs(query(collection(mine, 'hotelAssignments'), where('teamId', '==', A))));
    const other = as('aHk2');
    await assertFails(getDoc(doc(other, 'hotelAssignments', `${A}_${TODAY}_${A}-101`)));
  });

  it('a housekeeper can start and finish their room but not reassign it', async () => {
    const db = as('aHk');
    const ref = doc(db, 'hotelAssignments', `${A}_${TODAY}_${A}-101`);
    await assertSucceeds(updateDoc(ref, { outcome: 'in_progress', startedAt: 2, updatedAt: 2, updatedBy: 'aHk', updatedByName: 'aHk' }));
    await assertFails(updateDoc(ref, { assigneeUid: 'aHk2', updatedAt: 3, updatedBy: 'aHk' }));
    await assertFails(updateDoc(ref, { cleanType: 'deep', updatedAt: 3, updatedBy: 'aHk' }));
  });

  it('a housekeeper can move a room to clean but never to inspected', async () => {
    const db = as('aHk');
    const ref = doc(db, 'hotelRooms', `${A}-101`);
    await assertSucceeds(updateDoc(ref, { status: 'clean', statusAt: 2, statusBy: 'aHk', statusByName: 'aHk', lastCleanedAt: 2 }));
    await assertFails(updateDoc(ref, { status: 'inspected', statusAt: 3, statusBy: 'aHk', statusByName: 'aHk' }));
    await assertFails(updateDoc(ref, { number: '102' }));
  });

  it('a manager can mark a room inspected', async () => {
    const db = as('aManager');
    await assertSucceeds(updateDoc(doc(db, 'hotelRooms', `${A}-101`), { status: 'inspected', statusAt: 3, statusBy: 'aManager' }));
  });

  it('a housekeeper can report a fault but not work the queue or see compliance', async () => {
    const db = as('aHk');
    await assertSucceeds(
      setDoc(doc(db, 'hotelFaults', 'new'), {
        teamId: A, roomId: `${A}-101`, category: 'Other', priority: 'low', status: 'open', note: 'x',
        photos: [], afterPhotos: [], pendingPhotos: 0, reportedBy: 'aHk', createdAt: 1, updatedAt: 1,
      })
    );
    await assertSucceeds(getDoc(doc(db, 'hotelFaults', `${A}-f1`))); // their own report
    await assertFails(updateDoc(doc(db, 'hotelFaults', `${A}-f1`), { status: 'done' }));
    await assertFails(getDocs(query(collection(db, 'hotelFaults'), where('teamId', '==', A))));
    await assertFails(getDoc(doc(db, 'hotelComplianceChecks', `${A}-c1`)));
  });

  it('a housekeeper cannot promote themselves', async () => {
    const db = as('aHk');
    await assertFails(updateDoc(doc(db, 'hotelStaff', `${A}_aHk`), { role: 'manager' }));
  });

  it('maintenance works the fault queue and completes checks, but cannot edit check definitions', async () => {
    const db = as('aMaint');
    await assertSucceeds(getDocs(query(collection(db, 'hotelFaults'), where('teamId', '==', A))));
    await assertSucceeds(updateDoc(doc(db, 'hotelFaults', `${A}-f1`), { status: 'in_progress', updatedAt: 2 }));
    await assertSucceeds(updateDoc(doc(db, 'hotelComplianceChecks', `${A}-c1`), { nextDue: '2026-10-11', lastDoneAt: 2, lastResult: 'pass' }));
    await assertFails(updateDoc(doc(db, 'hotelComplianceChecks', `${A}-c1`), { frequency: 'annual' }));
    await assertFails(getDocs(query(collection(db, 'hotelAssignments'), where('teamId', '==', A))));
  });
});

describe('append-only history', () => {
  it('room events, fault updates, compliance logs and audit cannot be edited or deleted, even by a manager', async () => {
    const db = as('aManager');
    for (const [coll, id] of [
      ['hotelRoomEvents', `${A}-ev1`],
      ['hotelFaultUpdates', `${A}-fu1`],
      ['hotelComplianceLogs', `${A}-cl1`],
      ['hotelAudit', `${A}-au1`],
    ]) {
      await assertFails(updateDoc(doc(db, coll, id), { at: 99 }));
      await assertFails(deleteDoc(doc(db, coll, id)));
    }
  });

  it('history entries must be signed by the person writing them', async () => {
    const db = as('aHk');
    await assertFails(setDoc(doc(db, 'hotelRoomEvents', 'forged'), { teamId: A, roomId: `${A}-101`, to: 'clean', byUid: 'aManager', at: 2 }));
    await assertSucceeds(setDoc(doc(db, 'hotelRoomEvents', 'real'), { teamId: A, roomId: `${A}-101`, to: 'clean', byUid: 'aHk', at: 2 }));
  });
});
