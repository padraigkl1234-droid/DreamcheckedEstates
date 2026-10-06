// Hotel Operations module — data model.
//
// A team switched to `module: 'hotel'` (see teams.ts) gets this whole branch
// of the product instead of the estates pages. Every document below carries
// `teamId`, and firestore.rules scopes every hotel* collection to it, so one
// hotel can never read or write another's data.
//
// Collections (all top-level, all team-scoped):
//   hotelStaff/{teamId}_{uid}              who does what in this hotel (role)
//   hotelSettings/{teamId}                 time estimates, capacity, fault categories
//   hotelRooms/{id}                        a room and its CURRENT status
//   hotelRoomEvents/{id}                   append-only status history (audit trail)
//   hotelAssignments/{teamId}_{date}_{roomId}  one room's job for one day
//   hotelChecklistTemplates/{teamId}_{cleanType}  the checklist per clean type
//   hotelFaults/{id} + hotelFaultUpdates/{id}  faults and their append-only log
//   hotelComplianceChecks/{id} + hotelComplianceLogs/{id}  recurring checks + append-only log
//   hotelAudit/{id}                        append-only "who changed what" for settings/staff
//
// Hotel roles are deliberately separate from the estates chain of command
// (`rank` on the user profile): a hotel has its own manager / housekeeper /
// maintenance roles, held in hotelStaff and set only by a hotel manager.

export type HotelRole = 'manager' | 'housekeeper' | 'maintenance';

export interface HotelStaff {
  id: string; // `${teamId}_${uid}`
  teamId: string;
  uid: string;
  name: string;
  role: HotelRole;
  active: boolean;
  createdAt: number;
  updatedAt?: number;
  updatedBy?: string;
}

export type CleanType = 'departure' | 'stayover' | 'deep';

export interface HotelSettings {
  teamId: string;
  /** Estimated minutes per clean type, used by the workload panel. */
  minutes: Record<CleanType, number>;
  /** Minutes of cleaning one person can reasonably do in a shift. */
  shiftCapacityMinutes: number;
  faultCategories: string[];
  updatedAt?: number;
  updatedBy?: string;
}

export type RoomStatus = 'dirty' | 'in_progress' | 'clean' | 'inspected' | 'out_of_order';

export interface HotelRoom {
  id: string;
  teamId: string;
  number: string; // "101", "2A" — a label, not arithmetic
  floor: number;
  type: string; // single / double / twin / family / accessible / …
  status: RoomStatus;
  statusAt: number;
  statusBy?: string;
  statusByName?: string;
  /** Last time a clean was finished here (ms). Feeds the water-flush list. */
  lastCleanedAt?: number | null;
  /** Last date (YYYY-MM-DD) the room was known to be occupied. */
  lastOccupiedOn?: string | null;
  notes?: string;
  active: boolean;
  /** Reserved for a future booking-system integration: the PMS's own room
   * id, so an importer can match rooms without relying on the room number. */
  externalRef?: string | null;
  createdAt: number;
}

/** Append-only. One per status change, however it was made. */
export interface HotelRoomEvent {
  id: string;
  teamId: string;
  roomId: string;
  roomNumber: string;
  from: RoomStatus | null;
  to: RoomStatus;
  at: number;
  byUid: string;
  byName: string;
  note?: string;
  /** 'manual' today; an integration would write its own source. */
  source: 'manual';
}

export type AssignmentOutcome = 'pending' | 'in_progress' | 'done' | 'refused' | 'dnd';

/** One room's job for one day. Id `${teamId}_${date}_${roomId}`, so there is
 * never more than one per room per day and reassigning is a plain update. */
export interface HotelAssignment {
  id: string;
  teamId: string;
  date: string; // YYYY-MM-DD
  roomId: string;
  roomNumber: string;
  floor: number;
  roomType: string;
  cleanType: CleanType;
  assigneeUid: string | null;
  assigneeName: string | null;
  urgent: boolean;
  outcome: AssignmentOutcome;
  startedAt?: number | null;
  finishedAt?: number | null;
  note?: string;
  /** Checklist item id -> ticked. Lives on the assignment so a tick, the
   * start and the finish all land in one document (and one offline write). */
  checklist: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
  updatedByName: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface HotelChecklistTemplate {
  id: string; // `${teamId}_${cleanType}`
  teamId: string;
  cleanType: CleanType;
  items: ChecklistItem[];
  updatedAt?: number;
}

export type FaultPriority = 'low' | 'medium' | 'high' | 'urgent';
export type FaultStatus = 'open' | 'in_progress' | 'waiting_parts' | 'done';

export interface HotelPhoto {
  url: string;
  path: string;
  name: string;
  uploadedAt: number;
}

export interface HotelFault {
  id: string;
  teamId: string;
  roomId: string | null;
  roomNumber: string | null;
  area: string | null; // when not a room: "Kitchen", "Car park"…
  category: string;
  priority: FaultPriority;
  status: FaultStatus;
  note: string;
  photos: HotelPhoto[];
  afterPhotos: HotelPhoto[];
  /** Photos still sitting in a device's offline queue. */
  pendingPhotos: number;
  assigneeUid: string | null;
  assigneeName: string | null;
  reportedBy: string;
  reportedByName: string;
  markedOutOfOrder: boolean;
  complianceLogId?: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt?: number | null;
  closedBy?: string | null;
}

export type FaultUpdateKind = 'created' | 'status' | 'assign' | 'note' | 'photo';

/** Append-only fault log. */
export interface HotelFaultUpdate {
  id: string;
  teamId: string;
  faultId: string;
  kind: FaultUpdateKind;
  text: string;
  at: number;
  byUid: string;
  byName: string;
}

export type CheckFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
export type CheckKind = 'standard' | 'water_flush' | 'water_temp';
export type CheckResult = 'pass' | 'fail' | 'na';

export interface HotelComplianceCheck {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  kind: CheckKind;
  frequency: CheckFrequency;
  assigneeUid: string | null;
  assigneeName: string | null;
  nextDue: string; // YYYY-MM-DD
  lastDoneAt?: number | null;
  lastResult?: CheckResult | null;
  active: boolean;
  createdAt: number;
}

export interface WaterTempReading {
  outlet: string;
  hot?: number | null;
  cold?: number | null;
}

/** Append-only compliance record. */
export interface HotelComplianceLog {
  id: string;
  teamId: string;
  checkId: string;
  checkName: string;
  frequency?: CheckFrequency;
  date: string; // YYYY-MM-DD the check was done
  at: number;
  byUid: string;
  byName: string;
  result: CheckResult;
  notes?: string;
  photo?: HotelPhoto | null;
  faultId?: string | null;
  readings?: WaterTempReading[];
  roomsFlushed?: string[];
}

/** Append-only settings/staff audit. */
export interface HotelAuditEntry {
  id: string;
  teamId: string;
  at: number;
  byUid: string;
  byName: string;
  action: string;
  detail: string;
}
