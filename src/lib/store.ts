/**
 * All of the athlete's data lives client-side (localStorage on their device).
 * The full store is sent with each chat request; the server's tools mutate a
 * copy and return it, and the client persists whatever comes back.
 */

export interface Profile {
  name: string;
  goal: string;
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

export interface JarvisStore {
  profile: Profile;
  plan: PlanDay[];
  meals: MealEntry[];
  sets: SetEntry[];
  water: WaterEntry[];
  metrics: MetricEntry[];
}

export const DEFAULT_STORE: JarvisStore = {
  profile: {
    name: 'Athlete',
    goal: '',
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
};

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

export function loadStore(): JarvisStore {
  if (typeof window === 'undefined') return structuredClone(DEFAULT_STORE);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STORE);
    const parsed = JSON.parse(raw);
    // Merge over defaults so new fields added later never break old saves.
    return {
      ...structuredClone(DEFAULT_STORE),
      ...parsed,
      profile: { ...DEFAULT_STORE.profile, ...(parsed.profile ?? {}) },
    };
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
