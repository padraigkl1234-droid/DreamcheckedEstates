// Hotel module — labels, colours and the defaults a new hotel starts with.

import type {
  AssignmentOutcome,
  CheckFrequency,
  CheckKind,
  CheckResult,
  ChecklistItem,
  CleanType,
  FaultPriority,
  FaultStatus,
  HotelRole,
  HotelSettings,
  RoomStatus,
} from '@/lib/hotel/types';

export const HOTEL_MODULE = 'hotel';

export const HOTEL_ROLES: { value: HotelRole; label: string; blurb: string }[] = [
  { value: 'manager', label: 'Manager', blurb: 'Sees everything, assigns rooms, inspects and runs reports.' },
  { value: 'housekeeper', label: 'Housekeeper', blurb: 'Sees only their own rooms; can report faults.' },
  { value: 'maintenance', label: 'Maintenance', blurb: 'Works the fault queue and their compliance checks.' },
];

export const ROLE_LABELS: Record<HotelRole, string> = {
  manager: 'Manager',
  housekeeper: 'Housekeeper',
  maintenance: 'Maintenance',
};

// Tile/badge styling per room status. Text colours are ones the light theme
// already remaps (see globals.css) so they stay readable in both themes.
export const ROOM_STATUSES: { value: RoomStatus; label: string; short: string; tile: string; dot: string }[] = [
  { value: 'dirty', label: 'Dirty', short: 'Dirty', tile: 'border-alert/50 bg-alert/10 text-alert', dot: 'bg-alert' },
  { value: 'in_progress', label: 'In progress', short: 'In prog.', tile: 'border-amber-400/50 bg-amber-400/10 text-amber-300', dot: 'bg-amber-400' },
  { value: 'clean', label: 'Clean', short: 'Clean', tile: 'border-sky-400/50 bg-sky-400/10 text-sky-400', dot: 'bg-sky-400' },
  { value: 'inspected', label: 'Inspected', short: 'Inspected', tile: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400' },
  { value: 'out_of_order', label: 'Out of order', short: 'OOO', tile: 'border-neutral-400/40 bg-neutral-500/15 text-neutral-400', dot: 'bg-neutral-500' },
];

export function statusMeta(s: RoomStatus) {
  return ROOM_STATUSES.find((x) => x.value === s) ?? ROOM_STATUSES[0];
}

export const CLEAN_TYPES: { value: CleanType; label: string; short: string }[] = [
  { value: 'departure', label: 'Departure', short: 'DEP' },
  { value: 'stayover', label: 'Stayover', short: 'STAY' },
  { value: 'deep', label: 'Deep clean', short: 'DEEP' },
];

export function cleanTypeLabel(t: CleanType): string {
  return CLEAN_TYPES.find((c) => c.value === t)?.label ?? t;
}

/** Work order within a person's day: departures first (the next guest is
 * waiting on them), then deep cleans, then stayovers. */
export const CLEAN_TYPE_ORDER: Record<CleanType, number> = { departure: 0, deep: 1, stayover: 2 };

export const OUTCOME_LABELS: Record<AssignmentOutcome, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  refused: 'Guest refused service',
  dnd: 'Do not disturb',
};

export const ROOM_TYPES = ['Single', 'Double', 'Twin', 'Family', 'Accessible', 'Suite'];

export const FAULT_PRIORITIES: { value: FaultPriority; label: string; accent: string; rank: number }[] = [
  { value: 'urgent', label: 'Urgent', accent: 'border-alert/60 bg-alert/15 text-alert', rank: 0 },
  { value: 'high', label: 'High', accent: 'border-amber-400/50 bg-amber-400/10 text-amber-300', rank: 1 },
  { value: 'medium', label: 'Medium', accent: 'border-sky-400/40 bg-sky-400/10 text-sky-400', rank: 2 },
  { value: 'low', label: 'Low', accent: 'border-neutral-400/30 bg-invictus-base/60 text-neutral-400', rank: 3 },
];

export function priorityMeta(p: FaultPriority) {
  return FAULT_PRIORITIES.find((x) => x.value === p) ?? FAULT_PRIORITIES[2];
}

export const FAULT_STATUSES: { value: FaultStatus; label: string; accent: string }[] = [
  { value: 'open', label: 'Open', accent: 'border-alert/50 bg-alert/10 text-alert' },
  { value: 'in_progress', label: 'In progress', accent: 'border-amber-400/50 bg-amber-400/10 text-amber-300' },
  { value: 'waiting_parts', label: 'Waiting on parts', accent: 'border-sky-400/40 bg-sky-400/10 text-sky-400' },
  { value: 'done', label: 'Done', accent: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' },
];

export function faultStatusMeta(s: FaultStatus) {
  return FAULT_STATUSES.find((x) => x.value === s) ?? FAULT_STATUSES[0];
}

export const OPEN_FAULT_STATUSES: FaultStatus[] = ['open', 'in_progress', 'waiting_parts'];

export const DEFAULT_FAULT_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Furniture',
  'Heating',
  'Cleanliness',
  'Safety',
  'Other',
];

export const DEFAULT_SETTINGS: Omit<HotelSettings, 'teamId'> = {
  minutes: { departure: 30, stayover: 15, deep: 60 },
  shiftCapacityMinutes: 240,
  faultCategories: DEFAULT_FAULT_CATEGORIES,
};

const items = (prefix: string, labels: string[]): ChecklistItem[] =>
  labels.map((label, i) => ({ id: `${prefix}${i + 1}`, label }));

export const DEFAULT_CHECKLISTS: Record<CleanType, ChecklistItem[]> = {
  departure: items('dep', [
    'Strip beds and remake with fresh linen',
    'Replace all towels and bath mat',
    'Clean and disinfect bathroom',
    'Restock toiletries',
    'Restock tea, coffee and water',
    'Dust all surfaces',
    'Vacuum and mop floors',
    'Empty bins',
    'Check minibar and fridge',
    'Check for lost property',
    'Check lights, TV and remote',
  ]),
  stayover: items('stay', [
    'Make beds',
    'Replace towels if left on the floor',
    'Wipe bathroom surfaces',
    'Top up toiletries',
    'Top up tea, coffee and water',
    'Empty bins',
    'Quick vacuum',
  ]),
  deep: items('deep', [
    'Everything on the departure list',
    'Turn and rotate mattress',
    'Clean behind and under furniture',
    'Wash windows inside',
    'Descale shower head and taps',
    'Clean skirting boards and door frames',
    'Clean kettle and glassware',
    'Check curtains and upholstery for stains',
  ]),
};

export const FREQUENCIES: { value: CheckFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

export const CHECK_RESULTS: { value: CheckResult; label: string; accent: string }[] = [
  { value: 'pass', label: 'Pass', accent: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' },
  { value: 'fail', label: 'Fail', accent: 'border-alert/50 bg-alert/10 text-alert' },
  { value: 'na', label: 'N/A', accent: 'border-neutral-400/30 bg-invictus-base/60 text-neutral-400' },
];

export interface ComplianceTemplate {
  name: string;
  description: string;
  kind: CheckKind;
  frequency: CheckFrequency;
}

// The UK hotel starter set a manager can load in one tap on Compliance.
export const UK_HOTEL_COMPLIANCE_TEMPLATES: ComplianceTemplate[] = [
  {
    name: 'Fire alarm test',
    description: 'Activate a different call point each week; confirm sounders operate throughout and the panel resets.',
    kind: 'standard',
    frequency: 'weekly',
  },
  {
    name: 'Emergency lighting test',
    description: 'Short functional test of every emergency light fitting and exit sign.',
    kind: 'standard',
    frequency: 'monthly',
  },
  {
    name: 'Fire door checks',
    description: 'Doors close fully onto the latch, seals and hinges intact, nothing wedged open.',
    kind: 'standard',
    frequency: 'monthly',
  },
  {
    name: 'Fire extinguisher visual check',
    description: 'In place, pin and seal intact, gauge in the green, no visible damage, service label in date.',
    kind: 'standard',
    frequency: 'monthly',
  },
  {
    name: 'Water flush of unoccupied rooms',
    description: 'Run hot and cold outlets for two minutes in every room not occupied or cleaned in the last 7 days (Legionella control).',
    kind: 'water_flush',
    frequency: 'weekly',
  },
  {
    name: 'Water temperature readings',
    description: 'Sentinel outlets: hot at or above 50°C within a minute, cold below 20°C within two minutes.',
    kind: 'water_temp',
    frequency: 'monthly',
  },
  {
    name: 'First aid kit check',
    description: 'Contents complete and in date; restock anything used.',
    kind: 'standard',
    frequency: 'monthly',
  },
  {
    name: 'PAT testing',
    description: 'Portable appliance testing due date. Record the contractor and certificate reference in the notes.',
    kind: 'standard',
    frequency: 'annual',
  },
];

/** A room counts as unoccupied for the water flush when it has neither been
 * occupied nor cleaned for this many days. */
export const WATER_FLUSH_DAYS = 7;
