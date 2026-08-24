from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parent
DB = root / "backend" / "instance" / "salesmaster.db"
SQL = root / "stock-audit-schema.sql"

uri = f"file:{DB}?mode=ro"
with sqlite3.connect(uri, uri=True) as conn:
    conn.row_factory = sqlite3.Row
    sql = SQL.read_text()
    for statement in (s.strip() for s in sql.split(';')):
        if not statement or statement.startswith('.headers') or statement.startswith('.mode') or statement.startswith('.width'):
            continue
        rows = conn.execute(statement).fetchall()
        print(f"SQL> {statement.replace(chr(10), ' ')[:180]}")
        if rows:
            print(" | ".join(rows[0].keys()))
            for row in rows:
                print(" | ".join("" if value is None else str(value) for value in row))
        print()
