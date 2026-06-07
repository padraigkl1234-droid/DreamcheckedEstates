import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "dreamchecked.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        conn.executescript(SCHEMA_PATH.read_text())
        conn.commit()
        if conn.execute("SELECT COUNT(*) FROM defects").fetchone()[0] == 0:
            _seed(conn)
    finally:
        conn.close()


def _seed(conn):
    today = datetime.now().date()

    def days_ago(n):
        return (today - timedelta(days=n)).isoformat()

    sample_defects = [
        dict(
            title="Flickering lights on platform canopy",
            description="Several LED strips under the Scenic Railway platform canopy "
            "are flickering intermittently, worse in damp weather. Likely a "
            "loose connector rather than the driver units.",
            location="Scenic Railway",
            category="Electrical",
            priority="Medium",
            status="In Progress",
            assigned_to="Dave (Electrical contractor)",
            date_raised=days_ago(12),
            date_resolved=None,
            notes=["Reported to Dave, he's ordering replacement connectors."],
        ),
        dict(
            title="Leak under sink in staff kitchen",
            description="Steady drip from the pipework under the staff kitchen sink "
            "in Back of House. Bucket in place to catch water for now.",
            location="Back of House",
            category="Plumbing",
            priority="High",
            status="Open",
            assigned_to="",
            date_raised=days_ago(2),
            date_resolved=None,
            notes=[],
        ),
        dict(
            title="Cracked render on Rooftop Bar parapet wall",
            description="Hairline cracks spreading across the render on the "
            "north-facing parapet wall. Needs a proper inspection before "
            "the bar reopens for the season — could be water ingress related.",
            location="Rooftop Bar",
            category="Fabric/Building",
            priority="High",
            status="Open",
            assigned_to="Estates team",
            date_raised=days_ago(6),
            date_resolved=None,
            notes=["Photographed and sent to the structural surveyor for a quote."],
        ),
        dict(
            title="Fire extinguisher missing service tag",
            description="The CO2 extinguisher by the Arcade fire exit has no current "
            "service tag visible — needs checking against the register.",
            location="Arcade",
            category="Fire Safety",
            priority="Urgent",
            status="Open",
            assigned_to="Estates Coordinator",
            date_raised=days_ago(1),
            date_resolved=None,
            notes=[],
        ),
        dict(
            title="Overgrown hedge blocking Grounds CCTV camera",
            description="The hedge along the eastern boundary has grown into the "
            "field of view of camera G4. Needs cutting back.",
            location="Grounds",
            category="Grounds/Landscaping",
            priority="Low",
            status="Open",
            assigned_to="Grounds team",
            date_raised=days_ago(20),
            date_resolved=None,
            notes=[],
        ),
        dict(
            title="Roller Disco sound system cutting out",
            description="Sound drops out for a few seconds roughly every twenty "
            "minutes during sessions. Amp unit may be overheating.",
            location="Roller Disco",
            category="Mechanical",
            priority="Medium",
            status="In Progress",
            assigned_to="AV contractor",
            date_raised=days_ago(9),
            date_resolved=None,
            notes=[
                "Contractor visited, suspects the amp needs better ventilation.",
                "Temporary fan fitted while a permanent fix is sourced.",
            ],
        ),
        dict(
            title="Blocked drain outside Toilets (Front of House)",
            description="Surface water pooling outside the Front of House toilet "
            "block after rain — drain cover appears partially blocked.",
            location="Toilets",
            category="Plumbing",
            priority="Medium",
            status="Resolved",
            assigned_to="Estates team",
            date_raised=days_ago(30),
            date_resolved=days_ago(25),
            notes=["Cleared by hand, drain now flowing freely. Will monitor after heavy rain."],
        ),
        dict(
            title="Loose handrail on Main Stage access steps",
            description="The handrail on the left-hand access steps to Main Stage "
            "has noticeable movement at the base fixing.",
            location="Main Stage",
            category="Fabric/Building",
            priority="High",
            status="In Progress",
            assigned_to="Estates team",
            date_raised=days_ago(4),
            date_resolved=None,
            notes=["Cordoned off with bunting until refixed. Parts ordered."],
        ),
        dict(
            title="Octopus Garden ride motor making grinding noise",
            description="Operator reported a grinding noise from the main drive "
            "motor on startup. Ride taken out of service as a precaution.",
            location="Octopus Garden",
            category="Mechanical",
            priority="Urgent",
            status="Open",
            assigned_to="Ride engineer",
            date_raised=days_ago(0),
            date_resolved=None,
            notes=["Ride engineer booked for first thing tomorrow morning."],
        ),
        dict(
            title="Reception desk laminate lifting",
            description="The laminate edge on the Front of House reception desk "
            "is lifting and starting to catch on sleeves and bags.",
            location="Front of House",
            category="Fabric/Building",
            priority="Low",
            status="Resolved",
            assigned_to="Estates team",
            date_raised=days_ago(45),
            date_resolved=days_ago(40),
            notes=["Re-glued and clamped overnight. Holding well."],
        ),
    ]

    now = datetime.now().isoformat(timespec="seconds")
    for d in sample_defects:
        cur = conn.execute(
            """INSERT INTO defects
               (title, description, location, category, priority, status,
                assigned_to, date_raised, date_resolved)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                d["title"], d["description"], d["location"], d["category"],
                d["priority"], d["status"], d["assigned_to"], d["date_raised"],
                d["date_resolved"],
            ),
        )
        defect_id = cur.lastrowid
        for note in d["notes"]:
            conn.execute(
                "INSERT INTO defect_notes (defect_id, note, created_at) VALUES (?, ?, ?)",
                (defect_id, note, now),
            )
    conn.commit()
