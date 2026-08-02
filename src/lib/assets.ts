// Site assets — physical safety equipment (fire exits, extinguishers, alarm
// call points, emergency lights, hydrants, assembly points) pinned to a
// specific x/y position within a zone's floor plan (see zonePlans.ts). Each
// asset carries its own lightweight compliance record — a next-due date —
// so its status reuses the exact same red/amber/green thresholds as the
// general Compliance tracker, just tied to a location instead of floating
// free in a flat list.

import { getComplianceCountdown, type ComplianceUrgency } from '@/lib/complianceCountdown';

export type AssetType = 'fireExit' | 'extinguisher' | 'alarmCallPoint' | 'emergencyLight' | 'hydrant' | 'assemblyPoint';

export type AssetMount = 'floor' | 'wall' | 'ceiling';

export interface SiteAsset {
  id: string;
  type: AssetType;
  name: string; // e.g. "Fire Exit — East wall"
  zone: string; // matches a SITE_ZONES label, e.g. "Ballroom"
  x: number; // 0–1, normalised within the zone plan's bounds
  y: number; // 0–1
  mount: AssetMount;
  lastCheckedDate?: string; // YYYY-MM-DD
  nextDueDate?: string; // YYYY-MM-DD
  notes?: string;
  teamId: string;
  createdAt: number;
  createdBy?: string;
}

export const ASSET_TYPES: { value: AssetType; label: string; defaultMount: AssetMount }[] = [
  { value: 'fireExit', label: 'Fire Exit', defaultMount: 'floor' },
  { value: 'extinguisher', label: 'Extinguisher', defaultMount: 'wall' },
  { value: 'alarmCallPoint', label: 'Alarm Call Point', defaultMount: 'wall' },
  { value: 'emergencyLight', label: 'Emergency Light', defaultMount: 'ceiling' },
  { value: 'hydrant', label: 'Hydrant', defaultMount: 'floor' },
  { value: 'assemblyPoint', label: 'Assembly Point', defaultMount: 'floor' },
];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = Object.fromEntries(
  ASSET_TYPES.map((t) => [t.value, t.label])
) as Record<AssetType, string>;

// Fixed marker colour per type, so a layer reads at a glance on the plan —
// independent of compliance status, which is shown as a ring around the pin.
export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  fireExit: '#34d399',
  extinguisher: '#f87171',
  alarmCallPoint: '#fbbf24',
  emergencyLight: '#38bdf8',
  hydrant: '#c084fc',
  assemblyPoint: '#fde047',
};

export type AssetStatus = ComplianceUrgency | 'none';

export const ASSET_STATUS_COLORS: Record<AssetStatus, string> = {
  green: '#34d399',
  amber: '#fbbf24',
  red: '#f87171',
  none: '#6b7280',
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  green: 'Up to date',
  amber: 'Due soon',
  red: 'Overdue',
  none: 'Not tracked',
};

/** An asset's status, via the exact same day-count thresholds as the
 * general Compliance tracker (getComplianceCountdown) — 'none' if it has no
 * next-due date set yet. */
export function assetStatus(asset: Pick<SiteAsset, 'nextDueDate'>, now: Date = new Date()): AssetStatus {
  if (!asset.nextDueDate) return 'none';
  const result = getComplianceCountdown(
    { id: '', name: '', completed: false, date: '', nextDueDate: asset.nextDueDate, comments: '' },
    now
  );
  return result?.urgency ?? 'none';
}
