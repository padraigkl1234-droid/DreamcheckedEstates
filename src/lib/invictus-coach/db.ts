import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'invictus-coach-data') : path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'invictus-coach.db');

const DEFAULT_SPLIT: { weekday: number; label: string; focus: string; exercises: string[] }[] = [
  { weekday: 0, label: 'Active Recovery', focus: 'Mobility, soft tissue work, light Zone 1 cardio', exercises: ['Foam rolling', 'Dynamic mobility flow', '20-30min easy walk or bike'] },
  { weekday: 1, label: 'Lower Body — Strength & Power', focus: 'Max strength + explosive output, posterior chain bias', exercises: ['Back Squat', 'Romanian Deadlift', 'Box Jump', 'Walking Lunge', 'Standing Calf Raise'] },
  { weekday: 2, label: 'Upper Body — Push Strength', focus: 'Heavy horizontal/vertical pressing, triceps', exercises: ['Barbell Bench Press', 'Overhead Press', 'Weighted Dip', 'Incline DB Press', 'Triceps Pushdown'] },
  { weekday: 3, label: 'Conditioning & Core', focus: 'Aerobic base, anti-rotation core, recovery-friendly', exercises: ['Intervals (e.g. 6x400m or assault bike)', 'Hanging Leg Raise', 'Pallof Press', 'Farmer Carry'] },
  { weekday: 4, label: 'Lower Body — Hypertrophy', focus: 'Volume accumulation, hamstrings/glutes, single-leg stability', exercises: ['Front Squat', 'Bulgarian Split Squat', 'Leg Curl', 'Hip Thrust', 'Seated Calf Raise'] },
  { weekday: 5, label: 'Upper Body — Pull Strength', focus: 'Heavy pulling, lat width, grip & biceps', exercises: ['Weighted Pull-Up', 'Barbell Row', 'Lat Pulldown', 'Face Pull', 'Barbell Curl'] },
  { weekday: 6, label: 'Sport-Specific Power & Speed', focus: 'Sprint mechanics, plyometrics, reactive strength', exercises: ['Sprint work (flying 20s)', 'Depth Jump', 'Med Ball Rotational Throw', 'Sled Push'] },
];

const DEFAULT_SETTINGS: Record<string, string> = {
  display_name: 'Athlete',
  daily_calorie_target: '2800',
  daily_protein_target_g: '180',
  daily_carbs_target_g: '320',
  daily_fat_target_g: '90',
  daily_hydration_target_ml: '3500',
};

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_split (
      weekday INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      focus TEXT NOT NULL,
      exercises TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nutrition_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      food_name TEXT NOT NULL,
      calories REAL NOT NULL DEFAULT 0,
      protein_g REAL NOT NULL DEFAULT 0,
      carbs_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hydration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      amount_ml REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      split_label TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      exercise_name TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      reps INTEGER,
      weight_kg REAL,
      rpe REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS body_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight_kg REAL,
      body_fat_pct REAL,
      resting_hr REAL,
      sleep_hours REAL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nutrition_date ON nutrition_logs(date);
    CREATE INDEX IF NOT EXISTS idx_hydration_date ON hydration_logs(date);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON workout_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sets_session ON workout_sets(session_id);
    CREATE INDEX IF NOT EXISTS idx_body_metrics_date ON body_metrics(date);
  `);

  const settingCount = db.prepare('SELECT COUNT(*) as c FROM settings').get() as { c: number };
  if (settingCount.c === 0) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);
    });
    tx();
  }

  const splitCount = db.prepare('SELECT COUNT(*) as c FROM workout_split').get() as { c: number };
  if (splitCount.c === 0) {
    const insertSplit = db.prepare(
      'INSERT INTO workout_split (weekday, label, focus, exercises) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const day of DEFAULT_SPLIT) {
        insertSplit.run(day.weekday, day.label, day.focus, JSON.stringify(day.exercises));
      }
    });
    tx();
  }

  dbInstance = db;
  return db;
}
