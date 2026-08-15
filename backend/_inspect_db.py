import sqlite3
con = sqlite3.connect('data/nexora.db')
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print("TABLES:", tables)
for t in tables:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        c = cur.fetchone()[0]
        print(f"  {t}: {c} rows")
    except Exception as e:
        print(f"  {t}: ERROR {e}")
con.close()
