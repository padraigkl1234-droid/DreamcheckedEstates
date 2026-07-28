import { NextResponse } from 'next/server';
import { getAdminDb, getAdminMessaging } from '@/lib/firebaseAdmin';
import { pushToTokens } from '@/lib/serverNotify';
import { notifEnabled, type NotifPrefs } from '@/lib/teams';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhook called by a Power Automate flow when an Estate Request form is
// submitted (same pattern as /api/show-complete). It turns the response into
// a task that's *offered* to a person rather than assigned outright — they get
// a push notification and an Accept/Decline card, so taking the job is their
// call. Declining leaves the request with the owner to re-route.
//
// Expected JSON body:
//   {
//     "token":        "<ESTATE_REQUEST_SECRET>",
//     "title":        "Broken light — Ballroom corridor",   // required
//     "details":      "Flickering since Tuesday",           // optional
//     "location":     "Ballroom",                           // optional
//     "requestedBy":  "someone@dreamland.co.uk",            // optional
//     "priority":     "High",                               // optional
//     "dueDate":      "2026-08-05",                         // optional
//     "assigneeEmail":"tradesperson@dreamland.co.uk"        // optional — overrides
//   }                                                      //   the default approver

interface UserDoc {
  name?: string;
  displayName?: string;
  email?: string;
  teamId?: string;
  fcmTokens?: string[];
  notifPrefs?: NotifPrefs;
}

const nameOf = (u: UserDoc | undefined, fallback: string) => u?.displayName || u?.name || u?.email || fallback;

function normalizePriority(raw: string): 'High' | 'Medium' | 'Low' {
  const v = raw.trim().toLowerCase();
  if (v.startsWith('high') || v.startsWith('urgent') || v.startsWith('critical')) return 'High';
  if (v.startsWith('low')) return 'Low';
  return 'Medium';
}

export async function POST(req: Request) {
  const secret = process.env.ESTATE_REQUEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
  if (str('token') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const title = str('title');
  if (!title) {
    return NextResponse.json({ error: 'Missing title' }, { status: 400 });
  }
  const details = str('details');
  const location = str('location');
  const requestedBy = str('requestedBy');
  const priority = normalizePriority(str('priority'));
  const dueDate = str('dueDate').slice(0, 10);
  const assigneeEmail = str('assigneeEmail').toLowerCase();

  try {
    const db = getAdminDb();

    // Who the request goes to: an explicit assigneeEmail from the flow wins,
    // otherwise the default approver configured in the master console.
    const config = (await db.collection('config').doc('estateRequests').get()).data() as
      | { approverUid?: string; teamId?: string | null }
      | undefined;

    let approverUid = config?.approverUid ?? '';
    if (assigneeEmail) {
      const match = await db.collection('users').where('email', '==', assigneeEmail).limit(1).get();
      if (!match.empty) approverUid = match.docs[0].id;
    }
    if (!approverUid) {
      return NextResponse.json(
        { error: 'No approver configured — set one in Master Console → Automations.' },
        { status: 400 }
      );
    }

    // The request is owned by the master account so every incoming request is
    // visible for oversight even before anyone accepts it.
    const masterSnap = await db.collection('users').where('email', '==', MASTER_ADMIN_EMAIL).limit(1).get();
    const ownerUid = masterSnap.empty ? approverUid : masterSnap.docs[0].id;

    const [ownerDoc, approverDoc] = await Promise.all([
      db.collection('users').doc(ownerUid).get(),
      db.collection('users').doc(approverUid).get(),
    ]);
    const owner = ownerDoc.data() as UserDoc | undefined;
    const approver = approverDoc.data() as UserDoc | undefined;
    const ownerName = nameOf(owner, 'Estate Requests');
    const approverName = nameOf(approver, 'Teammate');

    // Everything the form captured beyond the title becomes the description,
    // which is also the opening entry of the task's timeline.
    const notes = [
      details,
      location ? `Location: ${location}` : '',
      requestedBy ? `Requested by: ${requestedBy}` : '',
      `Submitted via Estate Request form on ${new Date().toLocaleDateString('en-GB')}`,
    ]
      .filter(Boolean)
      .join('\n');

    // When the approver *is* the owner there's nobody to offer it to — the
    // task is simply theirs, so skip the pending/accept step.
    const offering = approverUid !== ownerUid;

    const ref = db.collection('tasks').doc();
    await ref.set({
      name: title,
      priority,
      dueDate,
      status: 'Not Started',
      notes,
      category: 'Estate Request',
      createdAt: Date.now(),
      ownerUid,
      ownerName,
      teamId: config?.teamId ?? owner?.teamId ?? null,
      participants: [ownerUid],
      participantNames: { [ownerUid]: ownerName },
      pendingUids: offering ? [approverUid] : [],
      pendingNames: offering ? { [approverUid]: approverName } : {},
      archived: false,
    });

    // Best-effort push — the task exists either way.
    let sent = 0;
    const tokens = approver?.fcmTokens ?? [];
    if (offering && tokens.length && notifEnabled(approver?.notifPrefs, 'taskAssignments')) {
      const result = await pushToTokens(db, getAdminMessaging(), approverUid, tokens, {
        title: 'New estate request',
        body: `"${title}" — tap to accept or decline`,
        url: '/jarvis-tracker?page=tasks',
        tag: `task-${ref.id}`,
      });
      sent = result.sent;
    }

    return NextResponse.json({ ok: true, taskId: ref.id, offeredTo: offering ? approverName : null, sent });
  } catch (error) {
    console.error('estate-request webhook error:', error);
    return NextResponse.json({ error: `Server error: ${(error as Error)?.message || 'unknown'}` }, { status: 500 });
  }
}
