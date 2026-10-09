'use client';

// Every write the hotel hub makes, in one place. Each one is a single
// Firestore batch so the current state and its history entry land together
// (or not at all).
//
// Offline: Firestore here runs with a persistent local cache, so a batch
// committed with no signal applies to the local view straight away and is
// sent when the connection returns — the commit promise only settles then.
// Phone-first screens therefore call these without awaiting (see `queued`),
// and the UI updates from the local snapshot.

import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  query,
  where,
  writeBatch,
  type DocumentData,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { advanceByFrequency, todayStr } from '@/lib/hotel/dates';
import { CLEAN_TYPES, DEFAULT_CHECKLISTS, DEFAULT_SETTINGS } from '@/lib/hotel/constants';
import type {
  AssignmentOutcome,
  CheckResult,
  CleanType,
  FaultPriority,
  FaultStatus,
  FaultUpdateKind,
  HotelAssignment,
  HotelComplianceCheck,
  HotelFault,
  HotelPhoto,
  HotelRole,
  HotelRoom,
  RoomStatus,
  WaterTempReading,
} from '@/lib/hotel/types';

export interface Actor {
  uid: string;
  name: string;
}

export interface HotelCtx {
  teamId: string;
  actor: Actor;
}

export const staffDocId = (teamId: string, uid: string) => `${teamId}_${uid}`;
export const assignmentDocId = (teamId: string, date: string, roomId: string) => `${teamId}_${date}_${roomId}`;
export const templateDocId = (teamId: string, cleanType: CleanType) => `${teamId}_${cleanType}`;

const newId = (coll: string) => doc(collection(db, coll)).id;

/** Commit without blocking the UI; report a failure (e.g. a rules denial)
 * whenever the server eventually answers. */
export function queued(p: Promise<unknown>, onError?: (message: string) => void) {
  p.catch((err) => {
    console.error('Hotel write failed:', err);
    onError?.((err as Error)?.message || 'That change could not be saved.');
  });
}

// ---- Rooms --------------------------------------------------------------

function addRoomStatus(
  batch: WriteBatch,
  ctx: HotelCtx,
  room: Pick<HotelRoom, 'id' | 'number' | 'status'>,
  to: RoomStatus,
  note?: string
) {
  const now = Date.now();
  const patch: DocumentData = {
    status: to,
    statusAt: now,
    statusBy: ctx.actor.uid,
    statusByName: ctx.actor.name,
  };
  if (to === 'clean') patch.lastCleanedAt = now;
  batch.update(doc(db, 'hotelRooms', room.id), patch);
  const ev: DocumentData = {
    teamId: ctx.teamId,
    roomId: room.id,
    roomNumber: room.number,
    from: room.status ?? null,
    to,
    at: now,
    byUid: ctx.actor.uid,
    byName: ctx.actor.name,
    source: 'manual',
  };
  if (note?.trim()) ev.note = note.trim();
  batch.set(doc(db, 'hotelRoomEvents', newId('hotelRoomEvents')), ev);
}

export function setRoomStatus(ctx: HotelCtx, room: HotelRoom, to: RoomStatus, note?: string) {
  const batch = writeBatch(db);
  addRoomStatus(batch, ctx, room, to, note);
  return batch.commit();
}

export interface RoomInput {
  number: string;
  floor: number;
  type: string;
  notes?: string;
  externalRef?: string | null;
}

export function createRooms(ctx: HotelCtx, rooms: RoomInput[]) {
  const batch = writeBatch(db);
  const now = Date.now();
  for (const r of rooms) {
    const id = newId('hotelRooms');
    batch.set(doc(db, 'hotelRooms', id), {
      teamId: ctx.teamId,
      number: r.number.trim(),
      floor: r.floor,
      type: r.type,
      status: 'dirty',
      statusAt: now,
      statusBy: ctx.actor.uid,
      statusByName: ctx.actor.name,
      lastCleanedAt: null,
      lastOccupiedOn: null,
      notes: r.notes?.trim() ?? '',
      active: true,
      externalRef: r.externalRef ?? null,
      createdAt: now,
    });
  }
  addAudit(batch, ctx, 'rooms.add', `Added ${rooms.length === 1 ? `room ${rooms[0].number}` : `${rooms.length} rooms`}`);
  return batch.commit();
}

/** Whether anything has ever been recorded against a room: a status change,
 *  a day's assignment, or a reported fault. A room with any of those is the
 *  reason Retire exists — deleting it would leave that history pointing at a
 *  room that no longer exists. One `limit(1)` read per collection, run only
 *  when someone actually asks to delete. */
export async function roomHasHistory(ctx: HotelCtx, room: HotelRoom): Promise<boolean> {
  const checks = [
    query(collection(db, 'hotelRoomEvents'), where('teamId', '==', ctx.teamId), where('roomId', '==', room.id), limit(1)),
    query(collection(db, 'hotelAssignments'), where('teamId', '==', ctx.teamId), where('roomId', '==', room.id), limit(1)),
    query(collection(db, 'hotelFaults'), where('teamId', '==', ctx.teamId), where('roomId', '==', room.id), limit(1)),
  ];
  // getDocs rather than the cache: a room created on another device could
  // have history this one has never seen.
  const snaps = await Promise.all(checks.map((q) => getDocs(q)));
  return snaps.some((snap) => !snap.empty);
}

/** Remove a room outright. Only for one added by mistake — callers must
 *  check roomHasHistory first; anything that has been used gets retired. */
export function deleteRoom(ctx: HotelCtx, room: HotelRoom) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'hotelRooms', room.id));
  addAudit(batch, ctx, 'rooms.delete', `Deleted room ${room.number} (no recorded history)`);
  return batch.commit();
}

/** Clear out a whole list of rooms, keeping any that have been used.
 *  Returns what went and what was kept, so the caller can say so rather than
 *  silently doing less than was asked. The history checks run a few at a
 *  time: a hundred rooms is three hundred reads, and firing them all at once
 *  is how you get throttled. */
export async function deleteRoomsWithoutHistory(
  ctx: HotelCtx,
  rooms: HotelRoom[]
): Promise<{ deleted: HotelRoom[]; kept: HotelRoom[] }> {
  const deleted: HotelRoom[] = [];
  const kept: HotelRoom[] = [];
  const BATCH = 8;
  for (let i = 0; i < rooms.length; i += BATCH) {
    const slice = rooms.slice(i, i + BATCH);
    const used = await Promise.all(slice.map((r) => roomHasHistory(ctx, r)));
    slice.forEach((r, n) => (used[n] ? kept : deleted).push(r));
  }
  // A write batch takes 500 operations, and the audit entry needs one of
  // them, so the rooms go 400 at a time with room to spare.
  const CHUNK = 400;
  for (let i = 0; i < deleted.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const r of deleted.slice(i, i + CHUNK)) batch.delete(doc(db, 'hotelRooms', r.id));
    addAudit(
      batch,
      ctx,
      'rooms.deleteAll',
      `Deleted ${deleted.slice(i, i + CHUNK).length} unused room(s)${kept.length ? `; kept ${kept.length} with history` : ''}`
    );
    await batch.commit();
  }
  return { deleted, kept };
}

export function updateRoom(ctx: HotelCtx, room: HotelRoom, patch: Partial<RoomInput> & { active?: boolean }) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'hotelRooms', room.id), patch);
  addAudit(batch, ctx, 'rooms.edit', `Room ${room.number}: ${Object.keys(patch).join(', ')}`);
  return batch.commit();
}

// ---- Assignments ----------------------------------------------------------

export interface AssignmentInput {
  cleanType: CleanType;
  assigneeUid: string | null;
  assigneeName: string | null;
  urgent: boolean;
}

/** Create or change a room's job for `date`. A new job also marks a clean or
 * inspected room dirty (it needs doing) and records it as occupied. */
export function upsertAssignments(
  ctx: HotelCtx,
  date: string,
  items: { room: HotelRoom; existing: HotelAssignment | null; input: AssignmentInput }[]
) {
  const batch = writeBatch(db);
  const now = Date.now();
  const who = { updatedAt: now, updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name };
  for (const { room, existing, input } of items) {
    const ref = doc(db, 'hotelAssignments', assignmentDocId(ctx.teamId, date, room.id));
    if (existing) {
      batch.update(ref, { ...input, ...who });
      continue;
    }
    batch.set(ref, {
      teamId: ctx.teamId,
      date,
      roomId: room.id,
      roomNumber: room.number,
      floor: room.floor,
      roomType: room.type,
      ...input,
      outcome: 'pending',
      startedAt: null,
      finishedAt: null,
      note: '',
      checklist: {},
      createdAt: now,
      ...who,
    });
    if (date === todayStr() && (room.status === 'clean' || room.status === 'inspected')) {
      addRoomStatus(batch, ctx, room, 'dirty', `Start of day: ${CLEAN_TYPES.find((c) => c.value === input.cleanType)?.label}`);
    }
    if (input.cleanType !== 'deep' && room.lastOccupiedOn !== date) {
      batch.update(doc(db, 'hotelRooms', room.id), { lastOccupiedOn: date });
    }
  }
  return batch.commit();
}

export function removeAssignment(a: HotelAssignment) {
  return deleteDoc(doc(db, 'hotelAssignments', a.id));
}

function assignmentPatch(ctx: HotelCtx, patch: DocumentData) {
  return { ...patch, updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name };
}

export function startClean(ctx: HotelCtx, a: HotelAssignment, room: HotelRoom) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'hotelAssignments', a.id), assignmentPatch(ctx, { outcome: 'in_progress', startedAt: Date.now() }));
  if (room.status !== 'in_progress') addRoomStatus(batch, ctx, room, 'in_progress', `Started ${a.cleanType} clean`);
  return batch.commit();
}

export function finishClean(ctx: HotelCtx, a: HotelAssignment, room: HotelRoom) {
  const batch = writeBatch(db);
  batch.update(
    doc(db, 'hotelAssignments', a.id),
    assignmentPatch(ctx, { outcome: 'done', finishedAt: Date.now(), startedAt: a.startedAt ?? Date.now() })
  );
  if (room.status !== 'out_of_order') addRoomStatus(batch, ctx, room, 'clean', `Finished ${a.cleanType} clean`);
  return batch.commit();
}

export function tickChecklist(ctx: HotelCtx, a: HotelAssignment, itemId: string, value: boolean) {
  const batch = writeBatch(db);
  // Dotted path: two quick ticks made offline never overwrite each other.
  batch.update(doc(db, 'hotelAssignments', a.id), assignmentPatch(ctx, { [`checklist.${itemId}`]: value }));
  return batch.commit();
}

/** Guest refused service / do not disturb (or undo back to pending). */
export function setOutcome(ctx: HotelCtx, a: HotelAssignment, room: HotelRoom, outcome: AssignmentOutcome, note: string) {
  const batch = writeBatch(db);
  const patch: DocumentData = { outcome, note: note.trim() };
  if (outcome === 'pending') {
    patch.startedAt = null;
    patch.finishedAt = null;
  }
  batch.update(doc(db, 'hotelAssignments', a.id), assignmentPatch(ctx, patch));
  // A room left mid-clean goes back to dirty rather than sitting "in progress".
  if (room.status === 'in_progress') addRoomStatus(batch, ctx, room, 'dirty', note || undefined);
  return batch.commit();
}

// ---- Faults -------------------------------------------------------------

export interface FaultInput {
  room: HotelRoom | null;
  area: string | null;
  category: string;
  priority: FaultPriority;
  note: string;
  markOutOfOrder: boolean;
  photoCount: number;
  complianceLogId?: string | null;
}

function addFault(batch: WriteBatch, ctx: HotelCtx, input: FaultInput): string {
  const id = newId('hotelFaults');
  const now = Date.now();
  batch.set(doc(db, 'hotelFaults', id), {
    teamId: ctx.teamId,
    roomId: input.room?.id ?? null,
    roomNumber: input.room?.number ?? null,
    area: input.room ? null : input.area?.trim() || null,
    category: input.category,
    priority: input.priority,
    status: 'open',
    note: input.note.trim(),
    photos: [],
    afterPhotos: [],
    pendingPhotos: input.photoCount,
    assigneeUid: null,
    assigneeName: null,
    reportedBy: ctx.actor.uid,
    reportedByName: ctx.actor.name,
    markedOutOfOrder: !!(input.room && input.markOutOfOrder),
    complianceLogId: input.complianceLogId ?? null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    closedBy: null,
  });
  addFaultUpdate(batch, ctx, id, 'created', `Reported: ${input.category}, ${input.priority} priority`);
  if (input.room && input.markOutOfOrder && input.room.status !== 'out_of_order') {
    addRoomStatus(batch, ctx, input.room, 'out_of_order', `Fault: ${input.note.trim().slice(0, 80) || input.category}`);
  }
  return id;
}

export function reportFault(ctx: HotelCtx, input: FaultInput): { id: string; commit: Promise<void> } {
  const batch = writeBatch(db);
  const id = addFault(batch, ctx, input);
  return { id, commit: batch.commit() };
}

function addFaultUpdate(batch: WriteBatch, ctx: HotelCtx, faultId: string, kind: FaultUpdateKind, text: string) {
  batch.set(doc(db, 'hotelFaultUpdates', newId('hotelFaultUpdates')), {
    teamId: ctx.teamId,
    faultId,
    kind,
    text,
    at: Date.now(),
    byUid: ctx.actor.uid,
    byName: ctx.actor.name,
  });
}

export function updateFault(
  ctx: HotelCtx,
  fault: HotelFault,
  patch: { status?: FaultStatus; assigneeUid?: string | null; assigneeName?: string | null; priority?: FaultPriority },
  log: { kind: FaultUpdateKind; text: string }
) {
  const batch = writeBatch(db);
  const full: DocumentData = { ...patch, updatedAt: Date.now() };
  if (patch.status === 'done') {
    full.closedAt = Date.now();
    full.closedBy = ctx.actor.uid;
  } else if (patch.status) {
    full.closedAt = null;
    full.closedBy = null;
  }
  batch.update(doc(db, 'hotelFaults', fault.id), full);
  addFaultUpdate(batch, ctx, fault.id, log.kind, log.text);
  return batch.commit();
}

export function addFaultNote(ctx: HotelCtx, fault: HotelFault, text: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'hotelFaults', fault.id), { updatedAt: Date.now() });
  addFaultUpdate(batch, ctx, fault.id, 'note', text.trim());
  return batch.commit();
}

/** Attach an uploaded photo (used by the photo outbox once it's online). */
export function attachFaultPhoto(faultId: string, field: 'photos' | 'afterPhotos', photo: HotelPhoto) {
  const batch = writeBatch(db);
  const patch: DocumentData = { [field]: arrayUnion(photo), updatedAt: Date.now() };
  if (field === 'photos') patch.pendingPhotos = increment(-1);
  batch.update(doc(db, 'hotelFaults', faultId), patch);
  return batch.commit();
}

// ---- Compliance ---------------------------------------------------------

export interface CheckInput {
  name: string;
  description?: string;
  kind: HotelComplianceCheck['kind'];
  frequency: HotelComplianceCheck['frequency'];
  assigneeUid: string | null;
  assigneeName: string | null;
  nextDue: string;
}

export function createChecks(ctx: HotelCtx, checks: CheckInput[]) {
  const batch = writeBatch(db);
  const now = Date.now();
  for (const c of checks) {
    batch.set(doc(db, 'hotelComplianceChecks', newId('hotelComplianceChecks')), {
      teamId: ctx.teamId,
      ...c,
      description: c.description ?? '',
      lastDoneAt: null,
      lastResult: null,
      active: true,
      createdAt: now,
    });
  }
  addAudit(batch, ctx, 'compliance.add', checks.length === 1 ? `Added check: ${checks[0].name}` : `Added ${checks.length} checks`);
  return batch.commit();
}

export function updateCheck(ctx: HotelCtx, check: HotelComplianceCheck, patch: Partial<CheckInput> & { active?: boolean }) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'hotelComplianceChecks', check.id), patch);
  addAudit(batch, ctx, 'compliance.edit', `${check.name}: ${Object.keys(patch).join(', ')}`);
  return batch.commit();
}

export interface CompletionInput {
  result: CheckResult;
  notes: string;
  photo: HotelPhoto | null;
  readings?: WaterTempReading[];
  roomsFlushed?: string[];
  /** Raise a fault from a failed check. */
  fault?: { priority: FaultPriority; category: string } | null;
}

export function completeCheck(ctx: HotelCtx, check: HotelComplianceCheck, input: CompletionInput) {
  const batch = writeBatch(db);
  const now = Date.now();
  const date = todayStr();
  const logId = newId('hotelComplianceLogs');
  let faultId: string | null = null;
  if (input.result === 'fail' && input.fault) {
    faultId = addFault(batch, ctx, {
      room: null,
      area: check.name,
      category: input.fault.category,
      priority: input.fault.priority,
      note: `Failed compliance check: ${check.name}${input.notes.trim() ? ` — ${input.notes.trim()}` : ''}`,
      markOutOfOrder: false,
      photoCount: 0,
      complianceLogId: logId,
    });
  }
  const log: DocumentData = {
    teamId: ctx.teamId,
    checkId: check.id,
    checkName: check.name,
    frequency: check.frequency,
    date,
    at: now,
    byUid: ctx.actor.uid,
    byName: ctx.actor.name,
    result: input.result,
    notes: input.notes.trim(),
    photo: input.photo,
    faultId,
  };
  if (input.readings?.length) log.readings = input.readings;
  if (input.roomsFlushed?.length) log.roomsFlushed = input.roomsFlushed;
  batch.set(doc(db, 'hotelComplianceLogs', logId), log);
  batch.update(doc(db, 'hotelComplianceChecks', check.id), {
    nextDue: advanceByFrequency(date, check.frequency),
    lastDoneAt: now,
    lastResult: input.result,
  });
  return { faultId, commit: batch.commit() };
}

// ---- Settings, staff, templates ----------------------------------------

function addAudit(batch: WriteBatch, ctx: HotelCtx, action: string, detail: string) {
  batch.set(doc(db, 'hotelAudit', newId('hotelAudit')), {
    teamId: ctx.teamId,
    at: Date.now(),
    byUid: ctx.actor.uid,
    byName: ctx.actor.name,
    action,
    detail,
  });
}

/** First visit by a manager: write the default settings and checklists. */
export function initialiseHotel(ctx: HotelCtx, missingTemplates: CleanType[], settingsMissing: boolean) {
  const batch = writeBatch(db);
  if (settingsMissing) {
    batch.set(doc(db, 'hotelSettings', ctx.teamId), { teamId: ctx.teamId, ...DEFAULT_SETTINGS, updatedAt: Date.now(), updatedBy: ctx.actor.uid });
  }
  for (const t of missingTemplates) {
    batch.set(doc(db, 'hotelChecklistTemplates', templateDocId(ctx.teamId, t)), {
      teamId: ctx.teamId,
      cleanType: t,
      items: DEFAULT_CHECKLISTS[t],
      updatedAt: Date.now(),
    });
  }
  addAudit(batch, ctx, 'hotel.init', 'Set up default settings and checklists');
  return batch.commit();
}

export function saveSettings(ctx: HotelCtx, patch: DocumentData, detail: string) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'hotelSettings', ctx.teamId), { ...patch, teamId: ctx.teamId, updatedAt: Date.now(), updatedBy: ctx.actor.uid }, { merge: true });
  addAudit(batch, ctx, 'settings.edit', detail);
  return batch.commit();
}

export function saveTemplate(ctx: HotelCtx, cleanType: CleanType, items: { id: string; label: string }[]) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'hotelChecklistTemplates', templateDocId(ctx.teamId, cleanType)), {
    teamId: ctx.teamId,
    cleanType,
    items,
    updatedAt: Date.now(),
  });
  addAudit(batch, ctx, 'checklist.edit', `${cleanType} checklist: ${items.length} items`);
  return batch.commit();
}

export function setStaffRole(
  ctx: HotelCtx,
  person: { uid: string; name: string },
  role: HotelRole,
  active: boolean,
  isNew: boolean
) {
  const batch = writeBatch(db);
  const ref = doc(db, 'hotelStaff', staffDocId(ctx.teamId, person.uid));
  const data: DocumentData = {
    teamId: ctx.teamId,
    uid: person.uid,
    name: person.name,
    role,
    active,
    updatedAt: Date.now(),
    updatedBy: ctx.actor.uid,
  };
  if (isNew) data.createdAt = Date.now();
  batch.set(ref, data, { merge: true });
  addAudit(batch, ctx, 'staff.role', `${person.name}: ${role}${active ? '' : ' (inactive)'}`);
  return batch.commit();
}
