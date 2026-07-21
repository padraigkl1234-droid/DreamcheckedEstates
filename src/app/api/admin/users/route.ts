import { NextResponse } from 'next/server';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Team-control endpoint. Called by the in-app Admin page with the signed-in
// user's Firebase ID token; only admins (the master account, or users an
// admin has promoted) may act, and the master account can never be targeted.
//
// Actions:
//   promote / demote      — toggle a user's admin role (master only)
//   block / unblock       — disable or re-enable the target's sign-in
//   remove                — take the target off the team roster; strips them
//                           from shared tasks (which stay with the remaining
//                           participants) and clears any pending offers.
//                           With deleteData: also deletes their private tasks
//                           and saved calendar/compliance data.

// Remove every trace of the user from the shared tasks collection. Shared
// tasks survive with the remaining participants; private tasks are deleted
// only when deletePrivate is set.
async function stripUserFromTasks(db: Firestore, uid: string, deletePrivate: boolean) {
  const mine = await db.collection('tasks').where('participants', 'array-contains', uid).get();
  for (const d of mine.docs) {
    const participants: string[] = (d.data().participants as string[]) ?? [];
    if (participants.length <= 1) {
      if (deletePrivate) await d.ref.delete();
    } else {
      await d.ref.update({
        participants: FieldValue.arrayRemove(uid),
        [`participantNames.${uid}`]: FieldValue.delete(),
      });
    }
  }
  const pending = await db.collection('tasks').where('pendingUids', 'array-contains', uid).get();
  for (const d of pending.docs) {
    await d.ref.update({
      pendingUids: FieldValue.arrayRemove(uid),
      [`pendingNames.${uid}`]: FieldValue.delete(),
    });
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const db = getAdminDb();

    const decoded = await adminAuth.verifyIdToken(idToken).catch(() => null);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const requesterEmail = (decoded.email ?? '').toLowerCase();
    const isMaster = requesterEmail === MASTER_ADMIN_EMAIL;
    let isAdmin = isMaster;
    if (!isAdmin) {
      const requesterDoc = await db.collection('users').doc(decoded.uid).get();
      isAdmin = requesterDoc.data()?.role === 'admin';
    }
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admins only' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const action = typeof body.action === 'string' ? body.action : '';
    const targetUid = typeof body.targetUid === 'string' ? body.targetUid : '';
    const deleteData = body.deleteData === true;
    if (!action || !targetUid) {
      return NextResponse.json({ error: 'Missing action or targetUid' }, { status: 400 });
    }
    if (targetUid === decoded.uid) {
      return NextResponse.json({ error: 'You cannot target your own account' }, { status: 400 });
    }

    // The master account is untouchable, whoever is asking.
    const targetUser = await adminAuth.getUser(targetUid).catch(() => null);
    if ((targetUser?.email ?? '').toLowerCase() === MASTER_ADMIN_EMAIL) {
      return NextResponse.json({ error: 'The master account cannot be modified' }, { status: 403 });
    }

    const targetRef = db.collection('users').doc(targetUid);

    switch (action) {
      case 'promote':
      case 'demote': {
        if (!isMaster) {
          return NextResponse.json({ error: 'Only the master account can change admin roles' }, { status: 403 });
        }
        await targetRef.set(
          { role: action === 'promote' ? 'admin' : FieldValue.delete() },
          { merge: true }
        );
        return NextResponse.json({ ok: true, action, targetUid });
      }
      case 'block': {
        if (targetUser) {
          await adminAuth.updateUser(targetUid, { disabled: true });
          // Kill live sessions as fast as possible (tokens refresh hourly).
          await adminAuth.revokeRefreshTokens(targetUid);
        }
        await targetRef.set({ blocked: true }, { merge: true });
        return NextResponse.json({ ok: true, action, targetUid });
      }
      case 'unblock': {
        if (targetUser) {
          await adminAuth.updateUser(targetUid, { disabled: false });
        }
        await targetRef.set({ blocked: FieldValue.delete() }, { merge: true });
        return NextResponse.json({ ok: true, action, targetUid });
      }
      case 'remove': {
        await stripUserFromTasks(db, targetUid, deleteData);
        if (deleteData) {
          await db.collection('jarvisState').doc(targetUid).delete();
        }
        await targetRef.delete();
        return NextResponse.json({ ok: true, action, targetUid, deletedData: deleteData });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('admin/users endpoint error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
