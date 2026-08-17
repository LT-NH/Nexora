import sqlite3
con = sqlite3.connect('data/nexora.db')
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print(f"共 {len(tables)} 张表")
for t in tables:
    try:
        c = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {c}")
    except Exception as e:
        print(f"  {t}: ERROR {e}")
con.close()
