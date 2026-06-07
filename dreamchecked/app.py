import csv
import io
from datetime import datetime

from flask import Flask, redirect, render_template, request, Response, url_for

import config
import db

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_filters(args):
    """Read filter/search/sort params from the query string."""
    return {
        "status": args.get("status", ""),
        "priority": args.get("priority", ""),
        "category": args.get("category", ""),
        "location": args.get("location", ""),
        "q": args.get("q", "").strip(),
        "sort": args.get("sort", "date_raised"),
        "direction": args.get("direction", "desc"),
    }


def query_defects(filters):
    """Return defect rows matching the given filters, sorted as requested."""
    clauses = []
    params = []

    for field in ("status", "priority", "category", "location"):
        value = filters[field]
        if value:
            clauses.append(f"{field} = ?")
            params.append(value)

    if filters["q"]:
        like = f"%{filters['q']}%"
        clauses.append(
            "(title LIKE ? OR description LIKE ? OR assigned_to LIKE ?)"
        )
        params.extend([like, like, like])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    conn = db.get_connection()
    try:
        rows = [dict(r) for r in conn.execute(
            f"SELECT * FROM defects {where}", params
        ).fetchall()]
    finally:
        conn.close()

    sort = filters["sort"]
    reverse = filters["direction"] == "desc"

    if sort == "priority":
        rows.sort(key=lambda r: config.PRIORITY_RANK.get(r["priority"], 99), reverse=reverse)
    else:  # date_raised (default) or date_resolved
        rows.sort(key=lambda r: r.get(sort) or "", reverse=reverse)

    return rows


def get_defect_or_404(defect_id):
    conn = db.get_connection()
    try:
        row = conn.execute("SELECT * FROM defects WHERE id = ?", (defect_id,)).fetchone()
    finally:
        conn.close()
    if row is None:
        from flask import abort
        abort(404)
    return dict(row)


# Make the dropdown lists available in every template.
@app.context_processor
def inject_globals():
    return {
        "LOCATIONS": config.LOCATIONS,
        "CATEGORIES": config.CATEGORIES,
        "PRIORITIES": config.PRIORITIES,
        "STATUSES": config.STATUSES,
    }


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.route("/")
def dashboard():
    conn = db.get_connection()
    try:
        rows = [dict(r) for r in conn.execute("SELECT * FROM defects").fetchall()]
    finally:
        conn.close()

    status_counts = {s: 0 for s in config.STATUSES}
    priority_counts = {p: 0 for p in config.PRIORITIES}
    category_counts = {c: 0 for c in config.CATEGORIES}

    for r in rows:
        if r["status"] in status_counts:
            status_counts[r["status"]] += 1
        if r["priority"] in priority_counts:
            priority_counts[r["priority"]] += 1
        if r["category"] in category_counts:
            category_counts[r["category"]] += 1

    urgent_open = [
        r for r in rows
        if r["status"] != "Resolved" and r["priority"] in ("Urgent", "High")
    ]
    urgent_open.sort(key=lambda r: (config.PRIORITY_RANK.get(r["priority"], 99), r["date_raised"]))

    return render_template(
        "dashboard.html",
        total=len(rows),
        status_counts=status_counts,
        priority_counts=priority_counts,
        category_counts=category_counts,
        urgent_open=urgent_open,
    )


# ---------------------------------------------------------------------------
# List / filter / search / sort
# ---------------------------------------------------------------------------

@app.route("/defects")
def defect_list():
    filters = build_filters(request.args)
    rows = query_defects(filters)
    return render_template("list.html", defects=rows, filters=filters)


@app.route("/defects/export.csv")
def export_csv():
    filters = build_filters(request.args)
    rows = query_defects(filters)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "ID", "Title", "Description", "Location", "Category", "Priority",
        "Status", "Assigned To", "Date Raised", "Date Resolved",
    ])
    for r in rows:
        writer.writerow([
            r["id"], r["title"], r["description"], r["location"], r["category"],
            r["priority"], r["status"], r["assigned_to"], r["date_raised"],
            r["date_resolved"] or "",
        ])

    filename = f"dreamchecked_defects_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# Log a new defect
# ---------------------------------------------------------------------------

@app.route("/defects/new", methods=["GET", "POST"])
def new_defect():
    if request.method == "POST":
        form = request.form
        conn = db.get_connection()
        try:
            conn.execute(
                """INSERT INTO defects
                   (title, description, location, category, priority, status,
                    assigned_to, date_raised, date_resolved)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    form["title"].strip(),
                    form.get("description", "").strip(),
                    form["location"],
                    form["category"],
                    form["priority"],
                    form.get("status", "Open"),
                    form.get("assigned_to", "").strip(),
                    datetime.now().date().isoformat(),
                    form.get("date_resolved") or None,
                ),
            )
            conn.commit()
        finally:
            conn.close()
        return redirect(url_for("defect_list"))

    return render_template("defect_form.html", defect=None, mode="new")


# ---------------------------------------------------------------------------
# View / edit / update an existing defect
# ---------------------------------------------------------------------------

@app.route("/defects/<int:defect_id>")
def view_defect(defect_id):
    defect = get_defect_or_404(defect_id)
    conn = db.get_connection()
    try:
        notes = [dict(r) for r in conn.execute(
            "SELECT * FROM defect_notes WHERE defect_id = ? ORDER BY id DESC",
            (defect_id,),
        ).fetchall()]
    finally:
        conn.close()
    return render_template("defect_detail.html", defect=defect, notes=notes)


@app.route("/defects/<int:defect_id>/edit", methods=["GET", "POST"])
def edit_defect(defect_id):
    defect = get_defect_or_404(defect_id)

    if request.method == "POST":
        form = request.form
        status = form["status"]
        date_resolved = form.get("date_resolved") or None
        # Auto-fill the resolved date when a defect is marked Resolved and
        # none has been entered yet; clear it if it's no longer resolved.
        if status == "Resolved" and not date_resolved:
            date_resolved = datetime.now().date().isoformat()
        elif status != "Resolved":
            date_resolved = None

        conn = db.get_connection()
        try:
            conn.execute(
                """UPDATE defects SET
                       title = ?, description = ?, location = ?, category = ?,
                       priority = ?, status = ?, assigned_to = ?, date_resolved = ?
                   WHERE id = ?""",
                (
                    form["title"].strip(),
                    form.get("description", "").strip(),
                    form["location"],
                    form["category"],
                    form["priority"],
                    status,
                    form.get("assigned_to", "").strip(),
                    date_resolved,
                    defect_id,
                ),
            )
            conn.commit()
        finally:
            conn.close()
        return redirect(url_for("view_defect", defect_id=defect_id))

    return render_template("defect_form.html", defect=defect, mode="edit")


@app.route("/defects/<int:defect_id>/notes", methods=["POST"])
def add_note(defect_id):
    get_defect_or_404(defect_id)
    note_text = request.form.get("note", "").strip()
    if note_text:
        conn = db.get_connection()
        try:
            conn.execute(
                "INSERT INTO defect_notes (defect_id, note, created_at) VALUES (?, ?, ?)",
                (defect_id, note_text, datetime.now().isoformat(timespec="seconds")),
            )
            conn.commit()
        finally:
            conn.close()
    return redirect(url_for("view_defect", defect_id=defect_id))


if __name__ == "__main__":
    db.init_db()
    app.run(host="127.0.0.1", port=5000, debug=True)
