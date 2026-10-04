import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

// Tenant isolation for the `users` roster: a team member may list their own
// team's profiles (filtered on teamId) but never another team's, and never
// the whole collection unfiltered.

const MASTER_EMAIL = 'padraigkl1234@gmail.com';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dreamchecked-rules',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { name: 'Alice', email: 'alice@a.test', teamId: 'teamA' });
    await setDoc(doc(db, 'users/andy'), { name: 'Andy', email: 'andy@a.test', teamId: 'teamA' });
    await setDoc(doc(db, 'users/bob'), { name: 'Bob', email: 'bob@b.test', teamId: 'teamB' });
    await setDoc(doc(db, 'users/newbie'), { name: 'Newbie', email: 'newbie@x.test' });
    await setDoc(doc(db, 'users/master'), { name: 'Master', email: MASTER_EMAIL });
  });
});

const asAlice = () => env.authenticatedContext('alice', { email: 'alice@a.test', email_verified: true }).firestore();
const asNewbie = () => env.authenticatedContext('newbie', { email: 'newbie@x.test', email_verified: true }).firestore();
const asMaster = () => env.authenticatedContext('master', { email: MASTER_EMAIL, email_verified: true }).firestore();

describe('users list (roster)', () => {
  it("lets a team member list their own team's users", async () => {
    const db = asAlice();
    const snap = await assertSucceeds(getDocs(query(collection(db, 'users'), where('teamId', '==', 'teamA'))));
    if (snap.size !== 2) throw new Error(`expected 2 team A users, got ${snap.size}`);
  });

  it("blocks a team member from listing another team's users", async () => {
    await assertFails(getDocs(query(collection(asAlice(), 'users'), where('teamId', '==', 'teamB'))));
  });

  it('blocks a team member from listing users unfiltered', async () => {
    await assertFails(getDocs(collection(asAlice(), 'users')));
  });

  it('blocks a signed-in user with no team from listing any roster', async () => {
    const db = asNewbie();
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(getDocs(query(collection(db, 'users'), where('teamId', '==', ''))));
  });

  it('blocks unauthenticated listing', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'users')));
  });

  it('still lets the master admin list every user unfiltered', async () => {
    const snap = await assertSucceeds(getDocs(collection(asMaster(), 'users')));
    if (snap.size !== 5) throw new Error(`expected 5 users, got ${snap.size}`);
  });
});

describe('users get (unchanged)', () => {
  it('lets a user with no team read their own profile', async () => {
    await assertSucceeds(getDoc(doc(asNewbie(), 'users/newbie')));
  });

  it('lets a team member get a single profile', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'users/andy')));
  });
});
