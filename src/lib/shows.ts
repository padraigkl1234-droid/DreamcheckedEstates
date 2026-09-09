// Shared shape for the Show Board's shows — split out so both the tracker's
// own Show Board tab and the standalone Event Mode page can read/write the
// same `shows` Firestore collection without duplicating the type.

import type { ChecklistSection } from '@/lib/checklists';

// A scheduled show. `type` matches a CHECKLIST_SECTIONS name and `completed`
// maps each checklist's name to whether its light is green. Structured this way
// so a Power Automate feed can flip lights by writing to `completed`.
export interface Show {
  id: string;
  date: string;
  type: string;
  title?: string;
  completed: Record<string, boolean>;
  teamId?: string | null;
  // Set when someone presses "Complete Show" on the Show Board — that's what
  // moves a show off the working board and into the Show Log. finishedResult
  // freezes the readiness tally at that moment, so the Log records what the
  // result actually was rather than recomputing it live against whatever the
  // team's checklists happen to look like later.
  finished?: boolean;
  finishedAt?: number;
  finishedBy?: string;
  finishedByName?: string;
  finishedResult?: { done: number; total: number; ready: boolean };
}

export interface ShowReadiness {
  forms: ChecklistSection['forms'];
  done: number;
  total: number;
  ready: boolean;
}

// A show's readiness against the checklists defined for its type — the same
// red/green tally used by the Show Board and now Event Mode.
export function showReadiness(show: Show, sections: ChecklistSection[]): ShowReadiness {
  const forms = sections.find((s) => s.name === show.type)?.forms ?? [];
  const done = forms.filter((f) => show.completed[f.name]).length;
  const total = forms.length;
  return { forms, done, total, ready: total > 0 && done === total };
}

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
