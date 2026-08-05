import { NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { CHECKLIST_SECTIONS } from '@/lib/checklists';

const normalize = (s: string) => s.trim().toLowerCase();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhook called by a Power Automate flow when a Microsoft Form is submitted.
// It flips the matching checklist's light green on the show of that type/date.
//
// Expected JSON body:
//   {
//     "token":         "<SHOW_WEBHOOK_SECRET>",
//     "showType":      "Scenic Stage Show",
//     "checklistName": "Event Manager Checklist",
//     "date":          "2026-06-29"   // optional; defaults to server's today
//   }
export async function POST(req: Request) {
  const secret = process.env.SHOW_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const showType = typeof body.showType === 'string' ? body.showType.trim() : '';
  const checklistName = typeof body.checklistName === 'string' ? body.checklistName.trim() : '';
  let date = typeof body.date === 'string' ? body.date.trim() : '';

  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!showType || !checklistName) {
    return NextResponse.json({ error: 'Missing showType or checklistName' }, { status: 400 });
  }

  // Accept full timestamps ("2026-06-29T18:00:00Z") — keep the date part only.
  // Default to the server's current date when none is supplied.
  if (date) {
    date = date.slice(0, 10);
  } else {
    const now = new Date();
    date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // Power Automate flows have their showType/checklistName hardcoded by hand,
  // so a small typo or case difference (e.g. "scenic stage show") would
  // otherwise silently match nothing. Resolve both against the known
  // checklist library case/whitespace-insensitively before querying, and
  // write the update under the exact canonical name the app expects — the
  // app looks up completion by that exact string.
  //
  // Neither one is allowed to fall back to the raw, unmatched value: a flow
  // with a wrong name used to still get a 200 and quietly write that wrong
  // string as a brand-new field nobody's looking at, so the box on screen
  // never ticked and nothing in Power Automate's run history said why. Now a
  // genuine typo is a loud 400 in the run history instead — "no show
  // scheduled today" (a real, expected case) stays a 200.
  const section = CHECKLIST_SECTIONS.find((s) => normalize(s.name) === normalize(showType));
  if (!section) {
    return NextResponse.json(
      {
        error: `Unknown showType "${showType}" — must be one of: ${CHECKLIST_SECTIONS.map((s) => s.name).join(', ')}`,
      },
      { status: 400 }
    );
  }
  const form = section.forms.find((f) => normalize(f.name) === normalize(checklistName));
  if (!form) {
    return NextResponse.json(
      {
        error: `Unknown checklistName "${checklistName}" for ${section.name} — must be one of: ${section.forms
          .map((f) => f.name)
          .join(', ')}`,
      },
      { status: 400 }
    );
  }
  const canonicalShowType = section.name;
  const canonicalChecklistName = form.name;

  try {
    const db = getAdminDb();
    const snap = await db
      .collection('shows')
      .where('type', '==', canonicalShowType)
      .where('date', '==', date)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: true, updated: 0, note: `No ${canonicalShowType} scheduled for ${date}` });
    }

    const batch = db.batch();
    snap.forEach((docSnap) => {
      batch.update(docSnap.ref, new FieldPath('completed', canonicalChecklistName), true);
    });
    await batch.commit();

    return NextResponse.json({ ok: true, updated: snap.size, checklistName: canonicalChecklistName, showType: canonicalShowType, date });
  } catch (error) {
    console.error('show-complete webhook error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
