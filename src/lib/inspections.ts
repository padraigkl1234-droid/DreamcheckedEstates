// In-app inspections: a checklist defined once (Fire Door Inspection, say),
// then run against the estate as often as needed. Running one files a Report,
// so inspections inherit everything reports already do — storage, visibility,
// attachments and PDF export — rather than growing a parallel system.
//
// A template is a list of questions, in the spirit of a Microsoft Form: each
// has a type (pass/fail, multiple choice, text, number, date, time, photo),
// can be marked required, and can take a note and photos alongside its answer.

export type InspectionOutcome = 'pass' | 'fail' | 'na';

export type InspectionQuestionType =
  | 'passFail'
  | 'choice'
  | 'text'
  | 'longText'
  | 'number'
  | 'date'
  | 'time'
  | 'photo';

export interface InspectionQuestion {
  id: string;
  label: string;
  type: InspectionQuestionType;
  required?: boolean;
  help?: string; // small print under the question
  options?: string[]; // choice only
  allowPhoto?: boolean; // offer a photo alongside the answer
  allowNote?: boolean; // offer a free-text note alongside the answer
  // Which area/section of the sheet this belongs to, e.g. "HBTS" or
  // "Ballroom" — questions sharing a section are grouped and can be cloned
  // wholesale into a new section (see cloneSection) rather than retyped.
  section?: string;
}

export type RecurrenceFrequency = 'none' | 'weekly' | 'monthly';

/** A template's own recurring due date — separate from the general
 * automations engine (src/lib/automations.ts), since it lives on the
 * checklist itself rather than as a standalone config doc. */
export interface InspectionSchedule {
  frequency: RecurrenceFrequency;
  dayOfWeek?: number | null; // 0 (Sun) – 6 (Sat), evaluated in UTC — weekly only
  dayOfMonth?: number | null; // 1–28, evaluated in UTC — monthly only
}

export interface InspectionTemplate {
  id: string;
  name: string;
  description?: string;
  /** Free-text grouping for organising the list, e.g. "H&S" or "Estates". */
  group?: string;
  questions?: InspectionQuestion[];
  /** @deprecated the original shape — a flat list of pass/fail lines. Read
   * through templateQuestions(), never directly. */
  items?: string[];
  schedule?: InspectionSchedule;
  // Who a due inspection is raised to as a task: the first person owns it,
  // the rest are offered it to accept or decline (same pattern as sharing a
  // task elsewhere in the app).
  assigneeUids?: string[];
  assigneeNames?: string[];
  /** Guards the scheduler (see /api/cron/automations) against double-firing
   * if the cron is retried the same day — today's date, once raised. */
  lastRunKey?: string | null;
  lastRunAt?: number | null;
  lastRunDetail?: string | null;
  teamId: string;
  createdAt: number;
  createdBy?: string;
}

export const RECURRENCE_LABELS: Record<RecurrenceFrequency, string> = {
  none: 'Manual only',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const MAX_DAY_OF_MONTH = 28;

/** True when `schedule` is due to raise a task on `now` (UTC). */
export function isTemplateDueToday(schedule: InspectionSchedule | undefined, now: Date): boolean {
  if (!schedule || schedule.frequency === 'none') return false;
  if (schedule.frequency === 'weekly') return schedule.dayOfWeek === now.getUTCDay();
  return schedule.dayOfMonth === now.getUTCDate();
}

/** How a schedule reads in the template list, e.g. "Weekly · Mondays". */
export function scheduleSummary(schedule: InspectionSchedule | undefined, dayLabels: string[]): string | null {
  if (!schedule || schedule.frequency === 'none') return null;
  if (schedule.frequency === 'weekly') return `Weekly · ${dayLabels[schedule.dayOfWeek ?? 1]}s`;
  return `Monthly · ${ordinal(schedule.dayOfMonth ?? 1)}`;
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export interface InspectionPhoto {
  url: string;
  path: string; // storage path, for deletion
  name: string;
}

/** One answered question of a completed inspection. */
export interface InspectionAnswer {
  questionId: string;
  label: string;
  type: InspectionQuestionType;
  section?: string; // denormalised from the question, so old reports keep it
  outcome?: InspectionOutcome; // passFail only
  value?: string; // everything else
  note?: string;
  photos?: InspectionPhoto[];
}

/** @deprecated pre-question-types answers. Read through recordAnswers(). */
export interface InspectionResult {
  item: string;
  result: InspectionOutcome;
  note?: string;
}

/** Stamped onto the Report a completed inspection files. */
export interface InspectionRecord {
  templateId: string;
  templateName: string;
  answers?: InspectionAnswer[];
  /** @deprecated superseded by answers. */
  results?: InspectionResult[];
}

export const QUESTION_TYPES: { value: InspectionQuestionType; label: string; blurb: string }[] = [
  { value: 'passFail', label: 'Pass / Fail', blurb: 'Pass, fail or not applicable' },
  { value: 'choice', label: 'Multiple choice', blurb: 'Pick one of your own options' },
  { value: 'text', label: 'Short answer', blurb: 'A line of text' },
  { value: 'longText', label: 'Long answer', blurb: 'A paragraph' },
  { value: 'number', label: 'Number', blurb: 'A reading or a count' },
  { value: 'date', label: 'Date', blurb: 'A calendar date' },
  { value: 'time', label: 'Time', blurb: 'A time of day' },
  { value: 'photo', label: 'Photo', blurb: 'Photos only, no written answer' },
];

export const QUESTION_TYPE_LABELS: Record<InspectionQuestionType, string> = Object.fromEntries(
  QUESTION_TYPES.map((t) => [t.value, t.label])
) as Record<InspectionQuestionType, string>;

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

export function newQuestionId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface SectionGroup<T> {
  name: string | null; // null = no section
  items: T[];
}

/** Buckets questions (or answers) by their `section`, in order of first
 * appearance — a real paper checklist reads as a sequence of areas, not an
 * alphabetised list, so this preserves whatever order they were authored in
 * rather than sorting. Unsectioned items form their own (unlabelled) bucket. */
export function groupBySection<T extends { section?: string }>(items: T[]): SectionGroup<T>[] {
  const order: (string | null)[] = [];
  const map = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.section?.trim() || null;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((name) => ({ name, items: map.get(name)! }));
}

/** Every distinct, non-empty section name already used in `questions`, in
 * order of first appearance — feeds the "pick an existing section" list. */
export function sectionNames(questions: InspectionQuestion[]): string[] {
  return groupBySection(questions)
    .map((g) => g.name)
    .filter((n): n is string => n !== null);
}

/** Clones every question in `section`, giving each a fresh id and the new
 * section name — "repeat these questions for another area" without retyping. */
export function cloneSection(questions: InspectionQuestion[], section: string, newSection: string): InspectionQuestion[] {
  return questions
    .filter((q) => (q.section?.trim() || null) === section)
    .map((q) => ({ ...q, id: newQuestionId(), section: newSection }));
}

export function blankQuestion(type: InspectionQuestionType = 'passFail'): InspectionQuestion {
  return {
    id: newQuestionId(),
    label: '',
    type,
    allowPhoto: type === 'passFail',
    ...(type === 'choice' ? { options: ['Option 1', 'Option 2'] } : {}),
  };
}

/** The one place that knows how to read a template's questions, including
 * templates saved before question types existed. */
export function templateQuestions(t: Pick<InspectionTemplate, 'questions' | 'items'>): InspectionQuestion[] {
  if (t.questions?.length) return t.questions;
  return (t.items ?? []).map((item, i) => ({
    id: `legacy-${i}`,
    label: item,
    type: 'passFail' as const,
    allowPhoto: true,
  }));
}

/** Likewise for a filed inspection's answers. */
export function recordAnswers(r: Pick<InspectionRecord, 'answers' | 'results'>): InspectionAnswer[] {
  if (r.answers?.length) return r.answers;
  return (r.results ?? []).map((res, i) => ({
    questionId: `legacy-${i}`,
    label: res.item,
    type: 'passFail' as const,
    outcome: res.result,
    ...(res.note ? { note: res.note } : {}),
  }));
}

/** A fresh, unanswered sheet. Pass/fail starts on pass — an inspection is
 * normally a walk-round where you only stop to record the exceptions. */
export function blankAnswers(questions: InspectionQuestion[]): InspectionAnswer[] {
  return questions.map((q) => ({
    questionId: q.id,
    label: q.label,
    type: q.type,
    ...(q.section ? { section: q.section } : {}),
    ...(q.type === 'passFail' ? { outcome: 'pass' as InspectionOutcome } : { value: '' }),
  }));
}

/** True when a required question hasn't been answered. */
export function isUnanswered(question: InspectionQuestion, answer: InspectionAnswer | undefined): boolean {
  if (!answer) return true;
  if (question.type === 'passFail') return !answer.outcome;
  if (question.type === 'photo') return !answer.photos?.length;
  return !answer.value?.trim();
}

export function countByOutcome(answers: InspectionAnswer[]) {
  const graded = answers.filter((a) => a.type === 'passFail');
  return {
    pass: graded.filter((a) => a.outcome === 'pass').length,
    fail: graded.filter((a) => a.outcome === 'fail').length,
    na: graded.filter((a) => a.outcome === 'na').length,
    graded: graded.length,
  };
}

/** A single failed item fails the inspection — that's the point of it. */
export function overallOutcome(answers: InspectionAnswer[]): 'pass' | 'fail' {
  return answers.some((a) => a.outcome === 'fail') ? 'fail' : 'pass';
}

/** How an answer reads on a report or in a PDF. */
export function answerText(a: InspectionAnswer): string {
  if (a.type === 'passFail') return a.outcome === 'na' ? 'N/A' : a.outcome === 'fail' ? 'Fail' : 'Pass';
  if (a.type === 'photo') return `${a.photos?.length ?? 0} photo${(a.photos?.length ?? 0) === 1 ? '' : 's'}`;
  return a.value?.trim() || '—';
}

/** The report's description: the pass/fail tally, then the failures, then
 * whatever else was recorded. */
export function summarise(answers: InspectionAnswer[]): string {
  const { pass, fail, na, graded } = countByOutcome(answers);
  const blocks: string[] = [];

  if (graded) {
    const parts = [`${pass} passed`, fail ? `${fail} failed` : '', na ? `${na} n/a` : ''].filter(Boolean);
    blocks.push(`${graded} item${graded === 1 ? '' : 's'} checked — ${parts.join(', ')}.`);
  }

  const failed = answers.filter((a) => a.outcome === 'fail');
  if (failed.length) {
    blocks.push(
      `Failed:\n${failed.map((a) => `• ${a.section ? `[${a.section}] ` : ''}${a.label}${a.note ? ` — ${a.note}` : ''}`).join('\n')}`
    );
  }

  const answered = answers.filter((a) => a.type !== 'passFail' && (a.value?.trim() || a.photos?.length));
  if (answered.length) {
    blocks.push(answered.map((a) => `${a.label}: ${answerText(a)}${a.note ? ` (${a.note})` : ''}`).join('\n'));
  }

  return blocks.join('\n\n') || 'Nothing recorded.';
}

// Ready-made checklists a team can drop in with one click rather than typing
// out from scratch. They're copied into the team's own templates on use, so
// editing a copy never touches this list.
const passFail = (label: string): Omit<InspectionQuestion, 'id'> => ({ label, type: 'passFail', allowPhoto: true });

export const STARTER_TEMPLATES: {
  name: string;
  description: string;
  group: string;
  questions: Omit<InspectionQuestion, 'id'>[];
}[] = [
  {
    name: 'Fire Door Inspection',
    description: 'Monthly check of every fire door on the estate.',
    group: 'H&S',
    questions: [
      { label: 'Door reference / location', type: 'text', required: true },
      passFail('Door leaf free of damage, warping or holes'),
      passFail('Door closes fully from any open position'),
      passFail('Self-closing device works and is undamaged'),
      passFail('Gaps around the door within 3–4mm'),
      passFail('Intumescent seals intact and unpainted'),
      passFail('Hinges secure with all screws in place'),
      passFail('Latch engages cleanly without sticking'),
      passFail('Signage present and legible on both sides'),
      passFail('Door not wedged, propped or obstructed'),
      passFail('Vision panel glazing sound and unmodified'),
      { label: 'Photo of the door as found', type: 'photo' },
    ],
  },
  {
    name: 'Monthly Emergency Lighting Check',
    description: 'Function test of emergency lighting and exit signage.',
    group: 'H&S',
    questions: [
      { label: 'Time test started', type: 'time' },
      passFail('All emergency luminaires illuminate on test'),
      passFail('Exit signs lit and unobstructed'),
      passFail('No damaged or missing diffusers'),
      passFail('Charging indicators showing healthy'),
      passFail('Escape routes clear along their full length'),
      { label: 'Number of failed luminaires', type: 'number' },
      { label: 'Anything needing follow-up', type: 'longText' },
    ],
  },
  {
    name: 'Estate Walk-Round',
    description: 'General condition sweep of the public areas.',
    group: 'Estates',
    questions: [
      { label: 'Weather', type: 'choice', options: ['Dry', 'Wet', 'Windy', 'Icy'] },
      passFail('Litter and waste cleared'),
      passFail('No trip hazards on walkways'),
      passFail('Fencing and barriers secure'),
      passFail('Lighting columns undamaged and working'),
      passFail('Signage clean and correct'),
      passFail('Drains and gullies free-flowing'),
      passFail('Furniture and planters in good order'),
      { label: 'General condition photos', type: 'photo' },
    ],
  },
];
