/**
 * All of the athlete's data lives client-side (localStorage on their device).
 * The full store is sent with each chat request; the server's tools mutate a
 * copy and return it, and the client persists whatever comes back.
 */

export interface Profile {
  name: string;
  goal: string;
  onboarded: boolean;
  experience?: string; // Beginner | Intermediate | Advanced
  daysPerWeek?: number;
  equipment?: string[];
  bodyweightKg?: number;
  heightCm?: number;
  age?: number;
  sex?: string; // Male | Female | Other
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  hydrationTargetMl: number;
}

export interface PlannedExercise {
  name: string;
  sets?: number;
  reps?: string;
  notes?: string;
}

export interface PlanDay {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  label: string;
  focus: string;
  exercises: PlannedExercise[];
}

export interface MealEntry {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface SetEntry {
  date: string;
  time: string;
  exercise: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
}

export interface WaterEntry {
  date: string;
  ml: number;
}

export interface MetricEntry {
  date: string;
  weightKg?: number;
  bodyFatPct?: number;
  restingHr?: number;
  sleepHours?: number;
}

export type MemoryCategory =
  | 'injury'
  | 'preference'
  | 'equipment'
  | 'record'
  | 'schedule'
  | 'nutrition'
  | 'goal'
  | 'general';

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'injury',
  'record',
  'preference',
  'nutrition',
  'equipment',
  'schedule',
  'goal',
  'general',
];

export const MEMORY_META: Record<MemoryCategory, { label: string; glyph: string }> = {
  injury: { label: 'Injury / Limitation', glyph: '⚠' },
  record: { label: 'Personal Record', glyph: '★' },
  preference: { label: 'Preference', glyph: '◈' },
  nutrition: { label: 'Nutrition', glyph: '◍' },
  equipment: { label: 'Equipment', glyph: '⬡' },
  schedule: { label: 'Schedule', glyph: '◷' },
  goal: { label: 'Goal', glyph: '◎' },
  general: { label: 'General', glyph: '•' },
};

export interface MemoryEntry {
  date: string; // when it was noted
  note: string; // a durable fact JARVIS should remember about the athlete
  category: MemoryCategory;
}

export interface JarvisStore {
  profile: Profile;
  plan: PlanDay[];
  meals: MealEntry[];
  sets: SetEntry[];
  water: WaterEntry[];
  metrics: MetricEntry[];
  memories: MemoryEntry[];
}

export const DEFAULT_STORE: JarvisStore = {
  profile: {
    name: 'Athlete',
    goal: '',
    onboarded: false,
    calorieTarget: 2500,
    proteinTargetG: 160,
    carbsTargetG: 280,
    fatTargetG: 80,
    hydrationTargetMl: 3000,
  },
  plan: [],
  meals: [],
  sets: [],
  water: [],
  metrics: [],
  memories: [],
};

export interface OnboardingInput {
  name: string;
  goal: string;
  experience?: string;
  daysPerWeek?: number;
  equipment?: string[];
  bodyweightKg?: number;
  heightCm?: number;
  age?: number;
  sex?: string;
}

/**
 * Derives calorie, macro, and hydration targets from onboarding inputs.
 * Uses Mifflin-St Jeor when body stats are available, otherwise sensible
 * goal-based defaults. These are only starting points — JARVIS can refine
 * them later via updateProfile.
 */
export function computeTargets(input: OnboardingInput): Pick<
  Profile,
  'calorieTarget' | 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG' | 'hydrationTargetMl'
> {
  const goal = input.goal.toLowerCase();
  const kg = input.bodyweightKg;

  // Protein per kg by goal (fat loss & muscle gain run higher).
  const proteinPerKg = /fat|lean|cut|lose/.test(goal)
    ? 2.0
    : /muscle|strong|gain|bulk/.test(goal)
    ? 1.8
    : 1.6;

  let calories: number;
  if (kg && input.heightCm && input.age) {
    const sexAdj = /female|woman/i.test(input.sex ?? '') ? -161 : 5;
    const bmr = 10 * kg + 6.25 * input.heightCm - 5 * input.age + sexAdj;
    const activity = (input.daysPerWeek ?? 3) >= 5 ? 1.725 : (input.daysPerWeek ?? 3) >= 3 ? 1.55 : 1.375;
    const tdee = bmr * activity;
    const goalAdj = /fat|lean|cut|lose/.test(goal)
      ? -400
      : /muscle|gain|bulk/.test(goal)
      ? 250
      : /strong/.test(goal)
      ? 150
      : 0;
    calories = Math.round((tdee + goalAdj) / 10) * 10;
  } else {
    calories = /fat|lean|cut|lose/.test(goal)
      ? 2100
      : /muscle|gain|bulk/.test(goal)
      ? 2800
      : 2500;
  }

  const proteinTargetG = kg ? Math.round(proteinPerKg * kg) : Math.round((calories * 0.3) / 4);
  const fatTargetG = Math.round((calories * 0.25) / 9);
  const carbsTargetG = Math.max(0, Math.round((calories - proteinTargetG * 4 - fatTargetG * 9) / 4));
  const hydrationTargetMl = kg ? Math.round((kg * 35) / 100) * 100 : 3000;

  return { calorieTarget: calories, proteinTargetG, carbsTargetG, fatTargetG, hydrationTargetMl };
}

export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function timeStr(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const STORAGE_KEY = 'jarvis.store.v1';

/** Merge a raw parsed object over defaults and backfill any newer fields. */
function normalize(parsed: any): JarvisStore {
  const store: JarvisStore = {
    ...structuredClone(DEFAULT_STORE),
    ...parsed,
    profile: { ...DEFAULT_STORE.profile, ...(parsed?.profile ?? {}) },
  };
  // Backfill category on memories saved before categories existed.
  store.memories = (store.memories ?? []).map((m: any) => ({
    date: m.date ?? todayStr(),
    note: m.note ?? '',
    category: (m.category as MemoryCategory) ?? 'general',
  }));
  return store;
}

export function loadStore(): JarvisStore {
  if (typeof window === 'undefined') return structuredClone(DEFAULT_STORE);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STORE);
    return normalize(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

export function saveStore(store: JarvisStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable — nothing sensible to do.
  }
}

/** Triggers a browser download of the full store as a timestamped JSON backup. */
export function downloadStore(store: JarvisStore): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jarvis-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Parses and normalises an imported backup file, merging over defaults. */
export function parseImportedStore(raw: string): JarvisStore {
  return normalize(JSON.parse(raw));
}
