import { NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';

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

  try {
    const db = getAdminDb();
    const snap = await db
      .collection('shows')
      .where('type', '==', showType)
      .where('date', '==', date)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: true, updated: 0, note: `No ${showType} scheduled for ${date}` });
    }

    const batch = db.batch();
    snap.forEach((docSnap) => {
      batch.update(docSnap.ref, new FieldPath('completed', checklistName), true);
    });
    await batch.commit();

    return NextResponse.json({ ok: true, updated: snap.size, checklistName, showType, date });
  } catch (error) {
    console.error('show-complete webhook error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
