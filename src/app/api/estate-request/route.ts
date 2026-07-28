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
// Field names mirror the Estates Request Form's own columns, so a Power
// Automate flow can wire each answer straight through:
//   {
//     "token":        "<ESTATE_REQUEST_SECRET>",  // required
//     "details":      "Doors next to cafe don't close",  // required (the form's
//                                                       //   "what happened" answer)
//     "title":        "Short summary",            // optional — derived from
//                                                 //   location + details if absent
//     "location":     "Roller disco doors",       // optional
//     "department":   "Guest Experience",         // optional
//     "requestedBy":  "Alex Lee",                 // optional (Full Name)
//     "priority":     "High: Needs attention…",   // optional (Urgency Level)
//     "dueDate":      "2026-08-05",               // optional (Due By)
//     "assigneeName": "Steven Barnard",           // optional (Assigned To) — either
//     "assigneeEmail":"steven@…"                  //   of these overrides the default
//   }

interface UserDoc {
  name?: string;
  displayName?: string;
  email?: string;
  teamId?: string;
  fcmTokens?: string[];
  notifPrefs?: NotifPrefs;
}

const nameOf = (u: UserDoc | undefined, fallback: string) => u?.displayName || u?.name || u?.email || fallback;
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// The form's Urgency Level answers are long sentences ("Critical/Emergency:
// Immediate risk to safety…"), so match on the leading label rather than
// expecting a bare High/Medium/Low.
function normalizePriority(raw: string): 'High' | 'Medium' | 'Low' {
  const v = normalize(raw);
  if (v.startsWith('critical') || v.startsWith('emergency') || v.startsWith('high') || v.startsWith('urgent')) {
    return 'High';
  }
  if (v.startsWith('scheduled') || v.startsWith('low')) return 'Low';
  return 'Medium'; // "Standard: General request (3–5 business days)" and anything unrecognised
}

// The form has no title field — just a free-text description — so build a
// readable one-liner from the location and the first sentence of the detail.
function deriveTitle(details: string, location: string): string {
  const firstLine = details.split(/\r?\n/)[0].trim();
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0].trim() || firstLine;
  const summary = firstSentence.length > 80 ? `${firstSentence.slice(0, 77).trimEnd()}…` : firstSentence;
  return location ? `${location} — ${summary}` : summary;
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

  const details = str('details');
  const location = str('location');
  const department = str('department');
  const requestedBy = str('requestedBy');
  const priority = normalizePriority(str('priority'));
  const dueDate = str('dueDate').slice(0, 10);
  const assigneeEmail = str('assigneeEmail').toLowerCase();
  const assigneeName = str('assigneeName');

  const title = str('title') || (details ? deriveTitle(details, location) : '');
  if (!title) {
    return NextResponse.json({ error: 'Missing details (or title)' }, { status: 400 });
  }

  try {
    const db = getAdminDb();

    // Who the request goes to: an explicit assignee from the flow wins,
    // otherwise the default approver configured in the master console.
    const config = (await db.collection('config').doc('estateRequests').get()).data() as
      | { approverUid?: string; teamId?: string | null }
      | undefined;

    let approverUid = config?.approverUid ?? '';
    let assigneeUnmatched = '';
    if (assigneeEmail) {
      const match = await db.collection('users').where('email', '==', assigneeEmail).limit(1).get();
      if (match.empty) assigneeUnmatched = assigneeEmail;
      else approverUid = match.docs[0].id;
    } else if (assigneeName) {
      // The sheet's "Assigned To" holds display names ("Steven Barnard"), not
      // emails, so match those against the roster. An unrecognised name falls
      // back to the default approver rather than dropping the request.
      const all = await db.collection('users').get();
      const hit = all.docs.find((d) => {
        const u = d.data() as UserDoc;
        return [u.displayName, u.name].some((n) => n && normalize(n) === normalize(assigneeName));
      });
      if (hit) approverUid = hit.id;
      else assigneeUnmatched = assigneeName;
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
    // which is also the opening entry of the task's timeline. An unmatched
    // "Assigned To" is recorded here so it isn't silently lost.
    const notes = [
      details,
      location ? `Location: ${location}` : '',
      department ? `Department: ${department}` : '',
      requestedBy ? `Requested by: ${requestedBy}` : '',
      assigneeUnmatched ? `Form requested "${assigneeUnmatched}" — no matching Invictus account` : '',
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
