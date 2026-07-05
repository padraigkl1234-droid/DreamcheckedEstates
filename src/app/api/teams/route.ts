import { NextResponse } from 'next/server';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import {
  DREAMLAND_TEAM_ID,
  DREAMLAND_TEAM_NAME,
  generateReferralCode,
  normalizeCode,
} from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Teams endpoint — called with the caller's Firebase ID token.
//
// Anyone signed in:
//   bootstrap   — ensure the Dreamland team exists, migrate legacy teamless
//                 users into it once, and register the caller's user doc.
//   join {code} — join the team whose referral code matches.
//
// Master only (the fixed master-admin email):
//   list                          — all teams + all users
//   createTeam {name}             — create a new team with a fresh code
//   regenCode {teamId}            — roll a team's referral code
//   moveUser {targetUid, teamId}  — move a user to another team
//   block / unblock {targetUid}   — disable / re-enable an account's sign-in
//   remove {targetUid, deleteData}— strip from shared tasks + delete user doc

async function ensureDreamland(db: Firestore) {
  const ref = db.collection('teams').doc(DREAMLAND_TEAM_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ name: DREAMLAND_TEAM_NAME, referralCode: generateReferralCode(), createdAt: Date.now() });
  } else if (!snap.data()?.referralCode) {
    await ref.update({ referralCode: generateReferralCode() });
  }
}

// One-time: every user who predates teams (no teamId) joins Dreamland. Guarded
// by a flag doc so brand-new signups afterwards stay teamless (they need a code).
async function migrateLegacyUsers(db: Firestore) {
  const metaRef = db.collection('appMeta').doc('teams');
  const meta = await metaRef.get();
  if (meta.data()?.migratedExistingUsers) return;
  const users = await db.collection('users').get();
  const batch = db.batch();
  users.forEach((u) => {
    if (!u.data()?.teamId) batch.update(u.ref, { teamId: DREAMLAND_TEAM_ID });
  });
  batch.set(metaRef, { migratedExistingUsers: true, migratedAt: Date.now() }, { merge: true });
  await batch.commit();
}

// One-time: stamp all existing shared data (checklists, audits, shows) as
// Dreamland's so it stays with Dreamland once collections become team-scoped.
async function migrateTeamData(db: Firestore) {
  const metaRef = db.collection('appMeta').doc('teams');
  const meta = await metaRef.get();
  if (meta.data()?.migratedTeamData) return;
  for (const coll of ['checklistForms', 'auditForms', 'shows']) {
    const snap = await db.collection(coll).get();
    const batch = db.batch();
    let count = 0;
    snap.forEach((d) => {
      if (!d.data()?.teamId) {
        batch.update(d.ref, { teamId: DREAMLAND_TEAM_ID });
        count++;
      }
    });
    if (count) await batch.commit();
  }
  await metaRef.set({ migratedTeamData: true, migratedTeamDataAt: Date.now() }, { merge: true });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

    const adminAuth = getAdminAuth();
    const db = getAdminDb();
    const decoded = await adminAuth.verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });

    const email = (decoded.email ?? '').toLowerCase();
    const isMaster = email === MASTER_ADMIN_EMAIL;

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* some actions have no body */
    }
    const action = typeof body.action === 'string' ? body.action : '';

    // --- Actions available to any signed-in user ---
    if (action === 'bootstrap') {
      await ensureDreamland(db);
      await migrateLegacyUsers(db);
      await migrateTeamData(db);
      // Register / refresh the caller's user doc.
      const userRef = db.collection('users').doc(decoded.uid);
      await userRef.set(
        {
          name: decoded.name || decoded.email || 'Unknown',
          email: decoded.email ?? null,
          lastSeen: Date.now(),
        },
        { merge: true }
      );
      const fresh = (await userRef.get()).data() ?? {};
      return NextResponse.json({ ok: true, teamId: fresh.teamId ?? null });
    }

    if (action === 'join') {
      const code = normalizeCode(typeof body.code === 'string' ? body.code : '');
      if (!code) return NextResponse.json({ error: 'Enter a referral code' }, { status: 400 });
      const match = await db.collection('teams').where('referralCode', '==', code).limit(1).get();
      if (match.empty) return NextResponse.json({ error: 'No team found for that code' }, { status: 404 });
      const team = match.docs[0];
      await db.collection('users').doc(decoded.uid).set({ teamId: team.id }, { merge: true });
      return NextResponse.json({ ok: true, teamId: team.id, teamName: team.data().name });
    }

    // --- Master-only actions ---
    if (!isMaster) return NextResponse.json({ error: 'Master admin only' }, { status: 403 });

    if (action === 'list') {
      await ensureDreamland(db);
      const [teamsSnap, usersSnap] = await Promise.all([
        db.collection('teams').get(),
        db.collection('users').get(),
      ]);
      const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
      const users = usersSnap.docs.map((d) => ({ uid: d.id, ...(d.data() as Record<string, unknown>) }));
      return NextResponse.json({ ok: true, teams, users });
    }

    if (action === 'createTeam') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return NextResponse.json({ error: 'Give the team a name' }, { status: 400 });
      const ref = await db.collection('teams').add({
        name,
        referralCode: generateReferralCode(),
        createdAt: Date.now(),
      });
      return NextResponse.json({ ok: true, teamId: ref.id });
    }

    if (action === 'regenCode') {
      const teamId = typeof body.teamId === 'string' ? body.teamId : '';
      if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 });
      const code = generateReferralCode();
      await db.collection('teams').doc(teamId).update({ referralCode: code });
      return NextResponse.json({ ok: true, referralCode: code });
    }

    // Everything below targets a specific user.
    const targetUid = typeof body.targetUid === 'string' ? body.targetUid : '';
    if (!targetUid) return NextResponse.json({ error: 'Missing targetUid' }, { status: 400 });
    const targetUser = await adminAuth.getUser(targetUid).catch(() => null);
    if ((targetUser?.email ?? '').toLowerCase() === MASTER_ADMIN_EMAIL) {
      return NextResponse.json({ error: 'The master account cannot be modified' }, { status: 403 });
    }
    const targetRef = db.collection('users').doc(targetUid);

    if (action === 'moveUser') {
      const teamId = typeof body.teamId === 'string' ? body.teamId : '';
      if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 });
      await targetRef.set({ teamId }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (action === 'block') {
      if (targetUser) {
        await adminAuth.updateUser(targetUid, { disabled: true });
        await adminAuth.revokeRefreshTokens(targetUid);
      }
      await targetRef.set({ blocked: true }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (action === 'unblock') {
      if (targetUser) await adminAuth.updateUser(targetUid, { disabled: false });
      await targetRef.set({ blocked: FieldValue.delete() }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (action === 'remove') {
      const deleteData = body.deleteData === true;
      const mine = await db.collection('tasks').where('participants', 'array-contains', targetUid).get();
      for (const d of mine.docs) {
        const participants: string[] = (d.data().participants as string[]) ?? [];
        if (participants.length <= 1) {
          if (deleteData) await d.ref.delete();
        } else {
          await d.ref.update({
            participants: FieldValue.arrayRemove(targetUid),
            [`participantNames.${targetUid}`]: FieldValue.delete(),
          });
        }
      }
      const pending = await db.collection('tasks').where('pendingUid', '==', targetUid).get();
      for (const d of pending.docs) await d.ref.update({ pendingUid: null, pendingName: null });
      if (deleteData) await db.collection('jarvisState').doc(targetUid).delete();
      await targetRef.delete();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('teams endpoint error:', error);
    const detail = (error as { message?: string })?.message || String(error);
    return NextResponse.json({ error: `Server error: ${detail}` }, { status: 500 });
  }
}
