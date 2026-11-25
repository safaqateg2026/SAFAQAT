import sqlite3
import unittest
from pathlib import Path


class MarketplaceDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        migrations = Path(__file__).resolve().parents[1] / "migrations"

        for migration in sorted(migrations.glob("*.sql")):
            self.db.executescript(
                migration.read_text(encoding="utf-8")
            )

    def tearDown(self):
        self.db.close()

    def test_marketplace_tables_exist(self):
        tables = {
            row[0] for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }

        self.assertTrue({
            "retailer_payment_method",
            "retailer_marketplace_presence",
            "courier_marketplace_presence"
        }.issubset(tables))

    def test_no_fabricated_retailers(self):
        count = self.db.execute(
            "SELECT COUNT(*) FROM marketplace_visible_retailer"
        ).fetchone()[0]
        self.assertEqual(count, 0)

    def test_no_fabricated_couriers(self):
        count = self.db.execute(
            "SELECT COUNT(*) FROM marketplace_available_courier"
        ).fetchone()[0]
        self.assertEqual(count, 0)

    def test_unknown_retailer_payment_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO retailer_payment_method VALUES (?, ?, ?)",
                ("unknown", "cash", 100)
            )

    def test_unknown_retailer_presence_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO retailer_marketplace_presence VALUES (?, ?, ?)",
                ("unknown", 1, 100)
            )

    def test_unknown_courier_presence_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO courier_marketplace_presence
                   VALUES (?, ?, ?, ?, ?, ?)""",
                ("unknown", 1, 31.2, 29.9, 100, 200)
            )

    def test_database_integrity(self):
        self.assertEqual(
            self.db.execute("PRAGMA integrity_check").fetchone()[0],
            "ok"
        )
        self.assertEqual(
            self.db.execute("PRAGMA foreign_key_check").fetchall(),
            []
        )


if __name__ == "__main__":
    unittest.main()
