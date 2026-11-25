import sqlite3
import unittest
from pathlib import Path


class DeliveryRequestTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")

        for migration in sorted(
            (Path(__file__).resolve().parents[1]
             / "migrations").glob("*.sql")
        ):
            self.db.executescript(
                migration.read_text(encoding="utf-8")
            )

        self.account("buyer", "consumer", 1)
        self.account("courier1", "courier", 2, "rider")
        self.account("courier2", "courier", 3, "rider")
        self.account("car1", "courier", 4, "car")

    def tearDown(self):
        self.db.close()

    def account(self, account_id, role, number, vehicle=None):
        email = None if role == "consumer" else (
            account_id + "@example.invalid"
        )

        self.db.execute("""
            INSERT INTO subscriber (
                id, role, phone, email, full_name,
                birth_date, governorate_code, district_code,
                address, latitude, longitude, created_at
            ) VALUES (?, ?, ?, ?, ?, '1990-01-01',
                      'test', 'test', 'Synthetic address',
                      31.2, 29.9, 100)
        """, (
            account_id, role,
            f"+2010{number:08d}", email, account_id
        ))

        self.db.execute("""
            UPDATE subscriber
            SET phone_verified_at = 101,
                email_verified_at = ?
            WHERE id = ?
        """, (101 if email else None, account_id))

        for policy in (
            "terms", "privacy", "commission",
            "sales_purchase", "delivery"
        ):
            self.db.execute("""
                INSERT INTO subscriber_policy_acceptance
                VALUES (?, ?, 'synthetic-v1', 101)
            """, (account_id, policy))

        if role != "consumer":
            self.db.execute("""
                INSERT INTO subscriber_verification_review (
                    id, subscriber_id, administrator_id,
                    decision, reviewed_at
                ) VALUES (?, ?, 'synthetic-admin', 'approved', 102)
            """, (account_id + "-review", account_id))

        self.db.execute("""
            UPDATE subscriber SET state = 'active'
            WHERE id = ?
        """, (account_id,))

        if vehicle:
            self.db.execute("""
                INSERT INTO subscriber_delivery (
                    subscriber_id, vehicle_type
                ) VALUES (?, ?)
            """, (account_id, vehicle))

            self.db.execute("""
                INSERT INTO courier_marketplace_presence
                VALUES (?, 1, 31.2, 29.9, 103, 300)
            """, (account_id,))

    def request(self, request_id="request1"):
        self.db.execute("""
            INSERT INTO delivery_request (
                id, requester_id, vehicle_type,
                created_at, updated_at
            ) VALUES (?, 'buyer', 'rider', 110, 110)
        """, (request_id,))

        self.db.execute("""
            INSERT INTO delivery_request_location
            VALUES (?, 31.2, 29.9, 31.21, 29.91, 110)
        """, (request_id,))

    def assign(self, courier, request_id="request1"):
        return self.db.execute("""
            UPDATE delivery_request
            SET state='assigned', courier_id=?, updated_at=120
            WHERE id=? AND state='pending'
        """, (courier, request_id)).rowcount

    def test_first_courier_wins(self):
        self.request()
        self.assertEqual(self.assign("courier1"), 1)
        self.assertEqual(self.assign("courier2"), 0)

    def test_wrong_vehicle_rejected(self):
        self.request()
        with self.assertRaises(sqlite3.IntegrityError):
            self.assign("car1")

    def test_courier_cannot_take_two_open_requests(self):
        self.request()
        self.request("request2")
        self.assign("courier1")
        with self.assertRaises(sqlite3.IntegrityError):
            self.assign("courier1", "request2")

    def test_expired_presence_rejected(self):
        self.request()
        self.db.execute("""
            UPDATE courier_marketplace_presence
            SET expires_at=115
            WHERE subscriber_id='courier1'
        """)
        with self.assertRaises(sqlite3.IntegrityError):
            self.assign("courier1")

    def test_cancellation_removes_location(self):
        self.request()
        self.db.execute("""
            UPDATE delivery_request
            SET state='cancelled', updated_at=120
            WHERE id='request1'
        """)
        self.assertEqual(self.db.execute("""
            SELECT COUNT(*) FROM delivery_request_location
        """).fetchone()[0], 0)

    def test_completion_removes_location(self):
        self.request()
        self.assign("courier1")
        self.db.execute("""
            UPDATE delivery_request
            SET state='picked_up', updated_at=130
            WHERE id='request1'
        """)
        self.db.execute("""
            UPDATE delivery_request
            SET state='completed', updated_at=140
            WHERE id='request1'
        """)
        self.assertEqual(self.db.execute("""
            SELECT COUNT(*) FROM delivery_request_location
        """).fetchone()[0], 0)

    def test_completed_request_cannot_reopen(self):
        self.request()
        self.db.execute("""
            UPDATE delivery_request
            SET state='cancelled', updated_at=120
            WHERE id='request1'
        """)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""
                UPDATE delivery_request
                SET state='pending', updated_at=130
                WHERE id='request1'
            """)

    def test_decline_does_not_cancel_request(self):
        self.request()
        self.db.execute("""
            INSERT INTO delivery_request_decline
            VALUES ('request1','courier1',115)
        """)
        self.assertEqual(self.assign("courier2"), 1)

    def test_courier_cannot_create_customer_request(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""
                INSERT INTO delivery_request (
                    id, requester_id, vehicle_type,
                    created_at, updated_at
                ) VALUES (
                    'invalid','courier1','rider',110,110
                )
            """)

    def test_suspended_courier_cannot_accept(self):
        self.request()
        self.db.execute("""
            UPDATE subscriber SET state='suspended'
            WHERE id='courier1'
        """)
        with self.assertRaises(sqlite3.IntegrityError):
            self.assign("courier1")


if __name__ == "__main__":
    unittest.main()
