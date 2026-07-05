import { getDb } from './db';

export interface WorkoutSplitDay {
  weekday: number;
  label: string;
  focus: string;
  exercises: string[];
}

export interface WorkoutSet {
  id: number;
  sessionId: number;
  exerciseName: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
}

export interface WorkoutSession {
  id: number;
  date: string;
  splitLabel: string | null;
  notes: string | null;
  sets: WorkoutSet[];
}

export interface NutritionEntry {
  id: number;
  date: string;
  time: string;
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes: string | null;
}

export interface NutritionTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entryCount: number;
}

export function todayStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeStr(d: Date = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

export function getSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export function updateSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getWorkoutSplit(): WorkoutSplitDay[] {
  const db = getDb();
  const rows = db.prepare('SELECT weekday, label, focus, exercises FROM workout_split ORDER BY weekday').all() as {
    weekday: number;
    label: string;
    focus: string;
    exercises: string;
  }[];
  return rows.map((r) => ({ weekday: r.weekday, label: r.label, focus: r.focus, exercises: JSON.parse(r.exercises) }));
}

export function getSplitDay(weekday: number): WorkoutSplitDay | null {
  const db = getDb();
  const row = db.prepare('SELECT weekday, label, focus, exercises FROM workout_split WHERE weekday = ?').get(weekday) as
    | { weekday: number; label: string; focus: string; exercises: string }
    | undefined;
  if (!row) return null;
  return { weekday: row.weekday, label: row.label, focus: row.focus, exercises: JSON.parse(row.exercises) };
}

export function setSplitDay(weekday: number, label: string, focus: string, exercises: string[]): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO workout_split (weekday, label, focus, exercises) VALUES (?, ?, ?, ?)
     ON CONFLICT(weekday) DO UPDATE SET label = excluded.label, focus = excluded.focus, exercises = excluded.exercises`
  ).run(weekday, label, focus, JSON.stringify(exercises));
}

export function logNutrition(entry: {
  foodName: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  notes?: string;
  date?: string;
}): NutritionEntry {
  const db = getDb();
  const now = new Date();
  const date = entry.date ?? todayStr(now);
  const result = db
    .prepare(
      `INSERT INTO nutrition_logs (date, time, food_name, calories, protein_g, carbs_g, fat_g, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      date,
      timeStr(now),
      entry.foodName,
      entry.calories,
      entry.proteinG ?? 0,
      entry.carbsG ?? 0,
      entry.fatG ?? 0,
      entry.notes ?? null,
      now.toISOString()
    );
  return {
    id: Number(result.lastInsertRowid),
    date,
    time: timeStr(now),
    foodName: entry.foodName,
    calories: entry.calories,
    proteinG: entry.proteinG ?? 0,
    carbsG: entry.carbsG ?? 0,
    fatG: entry.fatG ?? 0,
    notes: entry.notes ?? null,
  };
}

export function getNutritionForDate(date: string): NutritionEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, date, time, food_name as foodName, calories, protein_g as proteinG, carbs_g as carbsG, fat_g as fatG, notes
       FROM nutrition_logs WHERE date = ? ORDER BY time ASC`
    )
    .all(date) as NutritionEntry[];
  return rows;
}

export function getNutritionTotals(date: string): NutritionTotals {
  const entries = getNutritionForDate(date);
  return entries.reduce<NutritionTotals>(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
      entryCount: acc.entryCount + 1,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entryCount: 0 }
  );
}

export function logHydration(amountMl: number, date?: string): void {
  const db = getDb();
  const now = new Date();
  db.prepare(`INSERT INTO hydration_logs (date, time, amount_ml, created_at) VALUES (?, ?, ?, ?)`).run(
    date ?? todayStr(now),
    timeStr(now),
    amountMl,
    now.toISOString()
  );
}

export function getHydrationTotal(date: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(amount_ml), 0) as total FROM hydration_logs WHERE date = ?').get(date) as {
    total: number;
  };
  return row.total;
}

export function createWorkoutSession(date: string, splitLabel: string | null, notes: string | null): number {
  const db = getDb();
  const result = db
    .prepare(`INSERT INTO workout_sessions (date, split_label, notes, created_at) VALUES (?, ?, ?, ?)`)
    .run(date, splitLabel, notes, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function addWorkoutSet(
  sessionId: number,
  exerciseName: string,
  setNumber: number,
  reps: number | null,
  weightKg: number | null,
  rpe: number | null
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO workout_sets (session_id, exercise_name, set_number, reps, weight_kg, rpe, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, exerciseName, setNumber, reps, weightKg, rpe, new Date().toISOString());
}

export function logWorkoutSet(params: {
  date?: string;
  exerciseName: string;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  splitLabel?: string | null;
}): { sessionId: number; setNumber: number } {
  const db = getDb();
  const date = params.date ?? todayStr();

  let session = db
    .prepare('SELECT id FROM workout_sessions WHERE date = ? ORDER BY id DESC LIMIT 1')
    .get(date) as { id: number } | undefined;

  let sessionId: number;
  if (session) {
    sessionId = session.id;
  } else {
    sessionId = createWorkoutSession(date, params.splitLabel ?? null, null);
  }

  const setNumberRow = db
    .prepare(
      'SELECT COALESCE(MAX(set_number), 0) + 1 as n FROM workout_sets WHERE session_id = ? AND exercise_name = ?'
    )
    .get(sessionId, params.exerciseName) as { n: number };

  addWorkoutSet(sessionId, params.exerciseName, setNumberRow.n, params.reps, params.weightKg, params.rpe);

  return { sessionId, setNumber: setNumberRow.n };
}

export function getWorkoutSessionForDate(date: string): WorkoutSession | null {
  const db = getDb();
  const session = db
    .prepare('SELECT id, date, split_label as splitLabel, notes FROM workout_sessions WHERE date = ? ORDER BY id DESC LIMIT 1')
    .get(date) as { id: number; date: string; splitLabel: string | null; notes: string | null } | undefined;
  if (!session) return null;

  const sets = db
    .prepare(
      `SELECT id, session_id as sessionId, exercise_name as exerciseName, set_number as setNumber, reps, weight_kg as weightKg, rpe
       FROM workout_sets WHERE session_id = ? ORDER BY id ASC`
    )
    .all(session.id) as WorkoutSet[];

  return { ...session, sets };
}

export function getRecentWorkoutSessions(limit: number): WorkoutSession[] {
  const db = getDb();
  const sessions = db
    .prepare('SELECT id, date, split_label as splitLabel, notes FROM workout_sessions ORDER BY id DESC LIMIT ?')
    .all(limit) as { id: number; date: string; splitLabel: string | null; notes: string | null }[];

  return sessions.map((session) => {
    const sets = db
      .prepare(
        `SELECT id, session_id as sessionId, exercise_name as exerciseName, set_number as setNumber, reps, weight_kg as weightKg, rpe
         FROM workout_sets WHERE session_id = ? ORDER BY id ASC`
      )
      .all(session.id) as WorkoutSet[];
    return { ...session, sets };
  });
}

export function logBodyMetric(params: {
  date?: string;
  weightKg?: number;
  bodyFatPct?: number;
  restingHr?: number;
  sleepHours?: number;
  notes?: string;
}): void {
  const db = getDb();
  const date = params.date ?? todayStr();
  db.prepare(
    `INSERT INTO body_metrics (date, weight_kg, body_fat_pct, resting_hr, sleep_hours, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    date,
    params.weightKg ?? null,
    params.bodyFatPct ?? null,
    params.restingHr ?? null,
    params.sleepHours ?? null,
    params.notes ?? null,
    new Date().toISOString()
  );
}

export function getBodyMetricsHistory(limit: number) {
  const db = getDb();
  return db
    .prepare(
      `SELECT date, weight_kg as weightKg, body_fat_pct as bodyFatPct, resting_hr as restingHr, sleep_hours as sleepHours, notes
       FROM body_metrics ORDER BY date DESC LIMIT ?`
    )
    .all(limit);
}

export function getProgressSummary(days: number) {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = todayStr(since);

  const nutrition = db
    .prepare(
      `SELECT date, SUM(calories) as calories, SUM(protein_g) as proteinG, SUM(carbs_g) as carbsG, SUM(fat_g) as fatG
       FROM nutrition_logs WHERE date >= ? GROUP BY date ORDER BY date ASC`
    )
    .all(sinceStr);

  const hydration = db
    .prepare(`SELECT date, SUM(amount_ml) as amountMl FROM hydration_logs WHERE date >= ? GROUP BY date ORDER BY date ASC`)
    .all(sinceStr);

  const sessions = db
    .prepare(
      `SELECT date, split_label as splitLabel, COUNT(ws.id) as setCount
       FROM workout_sessions s LEFT JOIN workout_sets ws ON ws.session_id = s.id
       WHERE s.date >= ? GROUP BY s.id ORDER BY s.date ASC`
    )
    .all(sinceStr);

  const bodyMetrics = db
    .prepare(
      `SELECT date, weight_kg as weightKg, body_fat_pct as bodyFatPct FROM body_metrics WHERE date >= ? ORDER BY date ASC`
    )
    .all(sinceStr);

  return { nutrition, hydration, sessions, bodyMetrics };
}
