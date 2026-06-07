# DreamChecked

A small local tool for logging, tracking and reporting on estates defects and
maintenance issues at Dreamland Margate. Single user, runs entirely on your
own computer — no login, no cloud, no internet connection needed once it's
installed.

Your data lives in one file: `data/dreamchecked.db` (a SQLite database). As
long as you don't delete that file, nothing is lost between sessions.

## Requirements

- Python 3.9 or newer (check with `python3 --version`)

That's it — no Node, no Docker, no database server to install.

## First-time setup

Open a terminal in this folder (`dreamchecked/`) and run:

```
pip3 install -r requirements.txt
```

This installs Flask, the only thing DreamChecked needs. You only have to do
this once.

## Starting the app

From this folder, run:

```
python3 app.py
```

You should see something like:

```
 * Running on http://127.0.0.1:5000
```

Open that address — **http://127.0.0.1:5000** — in your web browser
(Chrome, Firefox, Edge, Safari all work). That's the whole app.

The first time you start it, it will create `data/dreamchecked.db` and fill
it with ten realistic sample defects so you can see how everything works.
You can edit or delete those freely — they're just there to show the system
in use.

## Stopping the app

Go back to the terminal window where it's running and press:

```
Ctrl + C
```

This shuts the local web server down. Your data has already been saved to
`data/dreamchecked.db` as you worked — there's no separate "save" step.

To use DreamChecked again later, just repeat the **Starting the app** step.
You don't need to repeat the setup step.

## What's in version 1

- **Log a defect** — title, description, location, category, priority,
  status, who it's assigned to, and dates raised/resolved.
- **List & filter** — every defect in a sortable table, filterable by
  status, priority, category and location, with free-text search.
- **Edit & update** — change status, reassign, and keep a running log of
  timestamped notes against each defect.
- **Dashboard** — open / in progress / resolved counts, breakdowns by
  priority and category, and a highlighted list of urgent/high items that
  are still outstanding.
- **CSV export** — export whatever you're currently looking at (filters and
  search included) to a CSV file you can open in Excel.

## Editing the location and category lists

Open `config.py` in this folder. Near the top you'll find plain lists:

```python
LOCATIONS = [
    "Scenic Railway",
    "Roller Disco",
    ...
]

CATEGORIES = [
    "Electrical",
    "Plumbing",
    ...
]
```

Add, remove or rename entries as needed, save the file, and restart the app
(`Ctrl+C` then `python3 app.py` again). Existing defects keep whatever
location/category they already had, even if you remove it from the list —
so renaming an entry won't relabel old records, it'll just stop appearing as
a choice for new ones.

## Backing up your data

Your entire database is the single file `data/dreamchecked.db`. To back it
up, just copy that file somewhere safe (a USB stick, a cloud-synced folder,
etc.) while the app is stopped.

## A note on what's next

The codebase is structured so that **scheduled inspections** (recurring
checks with pass/fail results and notes) can be added later as a new section
alongside defects — reusing the same locations list and the same
"timestamped log entries" pattern already used for defect notes — without
needing to rebuild what's here.
