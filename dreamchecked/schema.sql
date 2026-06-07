-- DreamChecked schema.
--
-- `location` and `category` are stored as plain text rather than foreign keys
-- so the dropdown lists in config.py can be edited freely without migrations.
-- `defect_notes` is a separate table (one row per note, timestamped) so the
-- update history reads like a log rather than a single overwritten field.
--
-- Future home for scheduled inspections: a separate `inspections` table
-- (location, due date, recurrence, pass/fail, notes) can reuse the same
-- LOCATIONS list and follow the same "one row per event" pattern as
-- defect_notes, without touching this schema.

CREATE TABLE IF NOT EXISTS defects (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    location      TEXT NOT NULL,
    category      TEXT NOT NULL,
    priority      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'Open',
    assigned_to   TEXT NOT NULL DEFAULT '',
    date_raised   TEXT NOT NULL,
    date_resolved TEXT
);

CREATE TABLE IF NOT EXISTS defect_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    defect_id  INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
    note       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_defect_notes_defect_id ON defect_notes(defect_id);
