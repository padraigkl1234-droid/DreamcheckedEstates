// In-app inspections: a checklist defined once (Fire Door Inspection, say),
// then run against the estate as often as needed. Running one files a Report,
// so inspections inherit everything reports already do — storage, visibility,
// attachments and PDF export — rather than growing a parallel system.

export type InspectionOutcome = 'pass' | 'fail' | 'na';

export interface InspectionTemplate {
  id: string;
  name: string;
  description?: string;
  items: string[]; // what gets checked, in order
  teamId: string;
  createdAt: number;
  createdBy?: string;
}

/** One line of a completed inspection. */
export interface InspectionResult {
  item: string;
  result: InspectionOutcome;
  note?: string;
}

/** Stamped onto the Report a completed inspection files. */
export interface InspectionRecord {
  templateId: string;
  templateName: string;
  results: InspectionResult[];
}

// Ready-made checklists a team can drop in with one click rather than typing
// out from scratch. They're copied into the team's own templates on use, so
// editing a copy never touches this list.
export const STARTER_TEMPLATES: { name: string; description: string; items: string[] }[] = [
  {
    name: 'Fire Door Inspection',
    description: 'Monthly check of every fire door on the estate.',
    items: [
      'Door leaf free of damage, warping or holes',
      'Door closes fully from any open position',
      'Self-closing device works and is undamaged',
      'Gaps around the door within 3–4mm',
      'Intumescent seals intact and unpainted',
      'Hinges secure with all screws in place',
      'Latch engages cleanly without sticking',
      'Signage present and legible on both sides',
      'Door not wedged, propped or obstructed',
      'Vision panel glazing sound and unmodified',
    ],
  },
  {
    name: 'Monthly Emergency Lighting Check',
    description: 'Function test of emergency lighting and exit signage.',
    items: [
      'All emergency luminaires illuminate on test',
      'Exit signs lit and unobstructed',
      'No damaged or missing diffusers',
      'Charging indicators showing healthy',
      'Escape routes clear along their full length',
      'Test key / switch points accessible',
    ],
  },
  {
    name: 'Estate Walk-Round',
    description: 'General condition sweep of the public areas.',
    items: [
      'Litter and waste cleared',
      'No trip hazards on walkways',
      'Fencing and barriers secure',
      'Lighting columns undamaged and working',
      'Signage clean and correct',
      'Drains and gullies free-flowing',
      'Furniture and planters in good order',
    ],
  },
];

export const INSPECTION_OUTCOMES: { value: InspectionOutcome; label: string; short: string }[] = [
  { value: 'pass', label: 'Pass', short: 'P' },
  { value: 'fail', label: 'Fail', short: 'F' },
  { value: 'na', label: 'N/A', short: '—' },
];

export const INSPECTION_OUTCOME_STYLES: Record<InspectionOutcome, string> = {
  pass: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300',
  fail: 'border-alert/50 bg-alert/10 text-alert',
  na: 'border-neutral-400/30 bg-invictus-base/60 text-neutral-500',
};

export function countByOutcome(results: InspectionResult[]) {
  return {
    pass: results.filter((r) => r.result === 'pass').length,
    fail: results.filter((r) => r.result === 'fail').length,
    na: results.filter((r) => r.result === 'na').length,
  };
}

/** A single failed item fails the inspection — that's the point of it. */
export function overallOutcome(results: InspectionResult[]): 'pass' | 'fail' {
  return results.some((r) => r.result === 'fail') ? 'fail' : 'pass';
}

/** One-line summary used as the report's description. */
export function summarise(results: InspectionResult[]): string {
  const { pass, fail, na } = countByOutcome(results);
  const parts = [`${pass} passed`, fail ? `${fail} failed` : '', na ? `${na} n/a` : ''].filter(Boolean);
  const failed = results.filter((r) => r.result === 'fail');
  const detail = failed.length
    ? `\n\nFailed:\n${failed.map((r) => `• ${r.item}${r.note ? ` — ${r.note}` : ''}`).join('\n')}`
    : '';
  return `${results.length} item${results.length === 1 ? '' : 's'} checked — ${parts.join(', ')}.${detail}`;
}
