import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("recovery", ROOT / "scripts/recover-server-data.py")
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)

def database(path):
    db = sqlite3.connect(path)
    for migration in sorted((ROOT / "apps/backend/migrations").glob("*.sql")):
        db.executescript(migration.read_text())
    db.execute("CREATE TABLE d1_migrations (name TEXT PRIMARY KEY)")
    db.executemany("INSERT INTO d1_migrations VALUES (?)", [(p.name,) for p in (ROOT / "apps/backend/migrations").glob("*.sql")])
    return db

def user(db, id, email):
    db.execute("INSERT INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,1,1)", (id,email,id))

def habit(db, id, owner, name, package=None):
    db.execute("INSERT INTO habits (id,user_id,name,category,frequency,source_type,package_id,package_item_id,created_at,updated_at) VALUES (?,?,?,'OTHER','daily',?,?,?,1,1)", (id,owner,name,'package' if package else 'manual',package,'item' if package else None))

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.source_path = self.root / 'source.db'
        source = database(self.source_path)
        user(source,'legacy','internal@cycle.local')
        source.execute("INSERT INTO packages VALUES ('pkg','legacy','Test package','','Cycle','1','[]',1,1)")
        source.execute("INSERT INTO package_items VALUES ('item-row','pkg','item','daily','✨','Task','',1,'OTHER','#fff',0,1,1)")
        source.execute("INSERT INTO installed_packages VALUES ('install','legacy','pkg','Test package','','Cycle','1',1,1)")
        habit(source,'old-manual','legacy','Read')
        habit(source,'old-package','legacy','Task','pkg')
        source.execute("INSERT INTO habit_logs VALUES ('log','old-manual','2026-10-11',1,NULL,1)")
        source.commit(); source.close()
        self.target = database(':memory:')
        user(self.target,'owner','owner@example.com')
        user(self.target,'other','other@example.com')
        habit(self.target,'current-manual','owner','Read')
        habit(self.target,'unrelated','other','Private other ritual')
        self.target.execute("INSERT INTO sessions VALUES ('session','owner','access','refresh',100,200)")
        self.backup = self.root / 'target.sql'
        self.write_backup()

    def tearDown(self):
        self.target.close(); self.temp.cleanup()

    def write_backup(self):
        self.backup.write_text('\n'.join(self.target.iterdump()))

    def test_additive_recovery_preserves_auth_and_maps_history_without_duplicates(self):
        manifest = recovery.prepare(self.source_path,self.backup,'owner@example.com',self.root/'plan')
        self.assertEqual(manifest['reused']['habits'],1)
        self.assertEqual(manifest['inserted']['habits'],1)
        sql = (self.root/'plan/recovery.sql').read_text()
        self.target.executescript(sql)
        self.target.executescript(sql)
        self.assertEqual(self.target.execute("SELECT count(*) FROM habits WHERE user_id='owner'").fetchone()[0],2)
        self.assertEqual(self.target.execute("SELECT habit_id FROM habit_logs").fetchone()[0],'current-manual')
        self.assertEqual(self.target.execute("SELECT user_id FROM packages").fetchone()[0],'owner')
        self.assertEqual(self.target.execute("SELECT count(*) FROM sessions WHERE access_hash='access'").fetchone()[0],1)
        self.assertEqual(self.target.execute("SELECT name FROM habits WHERE id='unrelated'").fetchone()[0],'Private other ritual')
        self.write_backup()
        repeated = recovery.prepare(self.source_path,self.backup,'owner@example.com',self.root/'again')
        self.assertTrue(all(value==0 for value in repeated['inserted'].values()))

    def test_id_collision_never_moves_another_users_ritual(self):
        habit(self.target,'old-package','other','Keep me')
        self.write_backup()
        result = recovery.prepare(self.source_path,self.backup,'owner@example.com',self.root/'collision')
        self.assertNotEqual(result['habitIdMapping']['old-package'],'old-package')
        self.target.executescript((self.root/'collision/recovery.sql').read_text())
        self.assertEqual(self.target.execute("SELECT user_id FROM habits WHERE id='old-package'").fetchone()[0],'other')

    def test_missing_account_stops_before_producing_sql(self):
        with self.assertRaises(ValueError):
            recovery.prepare(self.source_path,self.backup,'missing@example.com',self.root/'missing')
        self.assertFalse((self.root/'missing/recovery.sql').exists())

    def test_incomplete_snapshot_stops_before_producing_sql(self):
        empty = self.root / 'incomplete.db'
        empty.touch()
        with self.assertRaises(ValueError):
            recovery.prepare(empty,self.backup,'owner@example.com',self.root/'incomplete')
        self.assertFalse((self.root/'incomplete/recovery.sql').exists())

    def test_distinct_source_rituals_are_not_silently_collapsed(self):
        source = sqlite3.connect(self.source_path)
        habit(source,'second-read','legacy','Read')
        source.commit(); source.close()
        result = recovery.prepare(self.source_path,self.backup,'owner@example.com',self.root/'distinct')
        self.assertNotEqual(result['habitIdMapping']['old-manual'],result['habitIdMapping']['second-read'])
        self.assertEqual(result['inserted']['habits'],2)

if __name__ == '__main__': unittest.main()
