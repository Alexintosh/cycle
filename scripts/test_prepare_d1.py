import pathlib
import sqlite3
import tempfile
import unittest
import importlib.util
spec = importlib.util.spec_from_file_location("prepare_d1", pathlib.Path(__file__).with_name("prepare-d1.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
prepare, ROOT = module.prepare, module.ROOT


class MigrationTests(unittest.TestCase):
    def test_snapshot_preserves_ids_unicode_and_history_and_excludes_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source.db"
            with sqlite3.connect(source) as db:
                db.executescript((ROOT / "apps/backend/migrations/0001_initial.sql").read_text())
                db.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)", ("owner", "owner@example.com", "O'Connor 🦊", 1, 2, None))
                db.execute('INSERT INTO habits (id,user_id,name,frequency,created_at,updated_at) VALUES (?,?,?,?,?,?)', ("habit", "owner", "Read\n'stories'", "daily", 1, 2))
                db.execute("INSERT INTO habit_logs VALUES (?,?,?,?,?,?)", ("log", "habit", "2026-10-11", 1, "🦊", 1))
                db.execute("INSERT INTO one_time_passwords VALUES (?,?,?,?,?,?,?,?)", ("otp", "owner@example.com", "123456", 0, 5, 10, None, 1))
            before = source.read_bytes()
            result = prepare(source, root / "backup")
            self.assertEqual(source.read_bytes(), before)
            self.assertEqual(result["counts"]["habit_logs"], 1)
            exported = (root / "backup/d1-data.sql").read_text()
            self.assertNotIn("123456", exported)
            with sqlite3.connect(":memory:") as destination:
                destination.executescript((ROOT / "apps/backend/migrations/0001_initial.sql").read_text())
                destination.executescript(exported)
                self.assertEqual(destination.execute("SELECT id,name FROM habits").fetchone(), ("habit", "Read\n'stories'"))
                self.assertEqual(destination.execute("SELECT habit_id,note FROM habit_logs").fetchone(), ("habit", "🦊"))
            with self.assertRaises(FileExistsError):
                prepare(source, root / "backup")

    def test_orphaned_data_stops_export(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source.db"
            with sqlite3.connect(source) as db:
                db.executescript((ROOT / "apps/backend/migrations/0001_initial.sql").read_text())
                db.execute('INSERT INTO habits (id,user_id,name,frequency,created_at,updated_at) VALUES (?,?,?,?,?,?)', ("habit", "missing-user", "Read", "daily", 1, 2))
            with self.assertRaisesRegex(ValueError, "orphaned"):
                prepare(source, root / "backup")
            self.assertFalse((root / "backup/d1-data.sql").exists())


if __name__ == "__main__":
    unittest.main()
