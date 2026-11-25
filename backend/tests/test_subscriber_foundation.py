import sqlite3
import unittest
from pathlib import Path


class SubscriberFoundationTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.execute("PRAGMA foreign_keys = ON")
        migrations = Path(__file__).parents[1] / "migrations"
        for migration in sorted(migrations.glob("*.sql")):
            self.db.executescript(migration.read_text())

    def register(self, role, phone, email):
        self.db.execute(
            """INSERT INTO subscriber
               (id, role, phone, email, full_name, birth_date, governorate_code,
                district_code, address, latitude, longitude, created_at)
               VALUES (?, ?, ?, ?, 'Synthetic Account', '1990-01-01',
                       'test', 'test', 'Synthetic Address', 30, 31, 100)""",
            (role, role, phone, email),
        )

    def test_bicycle_migration_preserves_delivery_rows_and_role_guard(self):
        self.register("courier", "+201000000000", "courier@example.test")
        self.db.execute("INSERT INTO subscriber_delivery (subscriber_id, vehicle_type, plate_number) VALUES ('courier', 'rider', 'س 123')")
        migration = Path(__file__).parents[1] / "migrations" / "0012_bicycle_delivery.sql"
        self.db.executescript(migration.read_text())
        self.assertEqual(self.db.execute("SELECT vehicle_type, plate_number FROM subscriber_delivery").fetchone(), ("rider", "س 123"))
        self.db.execute("UPDATE subscriber_delivery SET vehicle_type='bicycle', plate_number=NULL WHERE subscriber_id='courier'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO subscriber_delivery (subscriber_id, vehicle_type) VALUES ('missing', 'bicycle')")
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_roles_contacts_and_membership_invariants(self):
        for index, role in enumerate(("supplier", "retailer", "consumer", "courier")):
            self.register(role, f"+20100000000{index}", None if role == "consumer" else f"{role}@example.test")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE subscriber SET id='other' WHERE id='consumer'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE subscriber SET role='retailer' WHERE id='consumer'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE subscriber SET phone='+201000000000' WHERE id='consumer'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE subscriber SET email=NULL WHERE id='supplier'")

    def test_activation_requires_verified_contact_policies_and_latest_review(self):
        self.register("retailer", "+201000000000", "retailer@example.test")
        activate = "UPDATE subscriber SET state='active' WHERE id='retailer'"
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(activate)
        self.db.executemany(
            "INSERT INTO subscriber_policy_acceptance VALUES ('retailer', ?, 'test', 101)",
            [(policy,) for policy in ("terms", "privacy", "commission", "sales_purchase")],
        )
        self.db.execute("UPDATE subscriber SET phone_verified_at=102, email_verified_at=102")
        for review_id, decision, reason, timestamp in (
            ("r1", "approved", None, 103),
            ("r2", "correction", "Synthetic reason", 104),
        ):
            self.db.execute(
                "INSERT INTO subscriber_verification_review VALUES (?, 'retailer', 'admin', ?, ?, ?)",
                (review_id, decision, reason, timestamp),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(activate)
        self.db.execute(
            "INSERT INTO subscriber_verification_review VALUES ('r3', 'retailer', 'admin', 'approved', NULL, 105)"
        )
        self.db.execute(activate)
        self.assertEqual(self.db.execute("SELECT state FROM subscriber").fetchone(), ("active",))

    def test_session_uniqueness_and_private_archive_role(self):
        self.register("consumer", "+201000000000", None)
        self.db.execute("INSERT INTO subscriber_session VALUES ('consumer', ?, NULL, 101, 101, 200, NULL)", ("a" * 64,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO subscriber_session VALUES ('consumer', ?, NULL, 102, 102, 201, NULL)", ("b" * 64,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO subscriber_archive_document VALUES ('doc', 'consumer', 'id_front', ?, 1, 101)",
                ("c" * 64,),
            )
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])


    def test_retailer_code_stability_and_consumer_favorites(self):
        self.register("retailer", "+201000000000", "retailer@example.test")
        self.register("consumer", "+201000000001", None)
        self.db.execute("INSERT INTO retailer_directory_identity VALUES ('retailer', 'Example-Code')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO retailer_directory_identity VALUES ('consumer', 'Other')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE retailer_directory_identity SET search_code='example-code'")
        row = self.db.execute(
            "SELECT retailer_id FROM retailer_directory_identity WHERE search_code = ?", ("EXAMPLE-CODE",)
        ).fetchone()
        self.assertEqual(row, ("retailer",))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO consumer_retailer_favorite VALUES ('consumer', 'retailer', 103)")

        self.db.executemany(
            "INSERT INTO subscriber_policy_acceptance VALUES (?, ?, 'test', 101)",
            [(role, policy) for role in ("consumer", "retailer")
             for policy in ("terms", "privacy", "commission", "sales_purchase")]
            + [("consumer", "delivery")],
        )
        self.db.execute(
            "INSERT INTO subscriber_verification_review VALUES ('review', 'retailer', 'admin', 'approved', NULL, 102)"
        )
        self.db.execute("UPDATE subscriber SET phone_verified_at=102, email_verified_at=102 WHERE role='retailer'")
        self.db.execute("UPDATE subscriber SET phone_verified_at=102 WHERE role='consumer'")
        self.db.execute("UPDATE subscriber SET state='active'")
        self.db.execute("INSERT INTO consumer_retailer_favorite VALUES ('consumer', 'retailer', 104)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO consumer_retailer_favorite VALUES ('consumer', 'retailer', 105)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO consumer_retailer_favorite VALUES ('retailer', 'retailer', 105)")
        self.db.execute("DELETE FROM consumer_retailer_favorite WHERE consumer_id='consumer' AND retailer_id='retailer'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM consumer_retailer_favorite").fetchone(), (0,))


if __name__ == "__main__":
    unittest.main()
