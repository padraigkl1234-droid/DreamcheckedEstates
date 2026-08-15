// Incident / near-miss reports. Deliberately separate from the general
// Reports system (src/lib/reports.ts) because the visibility model is
// fundamentally different: a general report is command/team visible, but an
// incident report is locked to the master admin plus whoever it gets
// assigned to (and, if filed under their own name, the person who filed it)
// — nobody else, not even a commander, sees it by default. Enforced in
// firestore.rules, not just this file.

import type { UserProfile } from '@/lib/teams';

export type IncidentType = 'nearMiss' | 'injury' | 'propertyDamage' | 'environmental' | 'security' | 'other';
export type IncidentStatus = 'submitted' | 'investigating' | 'completed';

export const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: 'nearMiss', label: 'Near Miss' },
  { value: 'injury', label: 'Injury / Accident' },
  { value: 'propertyDamage', label: 'Property Damage' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'security', label: 'Security' },
  { value: 'other', label: 'Other' },
];

export const INCIDENT_STATUSES: { value: IncidentStatus; label: string; accent: string }[] = [
  { value: 'submitted', label: 'Submitted', accent: 'text-alert border-alert/50 bg-alert/10' },
  { value: 'investigating', label: 'Investigating', accent: 'text-amber-300 border-amber-400/40 bg-amber-400/10' },
  { value: 'completed', label: 'Completed', accent: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' },
];

// Common options for injury-type reports — kept short and generic rather
// than an exhaustive HSE taxonomy; "Other" plus the free-text description
// covers anything not listed.
export const INJURY_TYPES = ['Cut / Laceration', 'Bruise / Contusion', 'Sprain / Strain', 'Burn', 'Fracture', 'Other'] as const;
export const BODY_PARTS = ['Head', 'Eye', 'Hand / Finger', 'Arm', 'Back', 'Leg', 'Foot / Ankle', 'Other'] as const;

export interface IncidentAttachment {
  url: string;
  path: string; // storage path, for deletion
  name: string;
  uploadedAt: number;
}

export interface IncidentReport {
  id: string;
  teamId: string;
  type: IncidentType;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD — when it happened
  time?: string; // HH:MM, optional
  // Location — an areaKey from the site map (a named zone like "Scenic
  // Stage", or "Grid F12" for open ground), the exact same shape Task
  // Manager already stores for a task's location.
  location?: string | null;
  // Injury-specific, only meaningful when type === 'injury'.
  injuryType?: string | null;
  bodyPart?: string | null;
  involvedPersons?: string; // free text — names of anyone involved
  witnesses?: string;
  immediateActionTaken?: string;
  status: IncidentStatus;
  // Filing.
  anonymous: boolean;
  createdBy?: string | null; // uid — absent/null when anonymous
  createdByName?: string | null; // absent/null when anonymous
  createdAt: number;
  // Assignment — master-only.
  assignedUid?: string | null;
  assignedName?: string | null;
  assignedAt?: number | null;
  investigationNotes?: string;
  attachments?: IncidentAttachment[];
}

export function incidentTypeLabel(type: IncidentType): string {
  return INCIDENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function incidentStatusMeta(status: IncidentStatus) {
  return INCIDENT_STATUSES.find((s) => s.value === status) ?? INCIDENT_STATUSES[0];
}

// Whether `viewer` may see `report`. Rules enforce this server-side too; this
// is the client-side mirror for building queries and defensive filtering.
export function canSeeIncident(
  report: Pick<IncidentReport, 'assignedUid' | 'anonymous' | 'createdBy'>,
  viewer: Partial<UserProfile> & { uid?: string },
  isMaster: boolean
): boolean {
  if (isMaster) return true;
  if (report.assignedUid && report.assignedUid === viewer.uid) return true;
  if (!report.anonymous && report.createdBy === viewer.uid) return true;
  return false;
}
