import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { findActiveSession, issueVerifiedSession, revokeSession } from "../sessions.mjs";

function databaseForTest(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL("../migrations/0001_subscriber_foundation.sql", import.meta.url), "utf8"));
  sql.exec(`
    INSERT INTO subscriber
        (id, role, phone, full_name, birth_date, governorate_code, district_code,
         address, latitude, longitude, created_at)
    VALUES ('member', 'consumer', '+201000000000', 'Synthetic', '1990-01-01',
            'test', 'test', 'Synthetic', 30, 31, 100);
    INSERT INTO subscriber_policy_acceptance VALUES
        ('member', 'terms', 'test', 101), ('member', 'privacy', 'test', 101),
        ('member', 'commission', 'test', 101), ('member', 'sales_purchase', 'test', 101),
        ('member', 'delivery', 'test', 101);
    UPDATE subscriber SET phone_verified_at = 102, state = 'active';
  `);
  const database = {
    prepare(statement) {
      return {
        bind(...values) {
          const named = Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
          return { first: async () => sql.prepare(statement).get(named) ?? null };
        },
      };
    },
  };
  return { database, sql };
}

test("two ordinary login claims yield exactly one active session", async t => {
  const { database, sql } = databaseForTest(t);
  const request = { subscriberId: "member", now: 104, expiresAt: 200 };
  const sessions = await Promise.all([
    issueVerifiedSession(database, request),
    issueVerifiedSession(database, request),
  ]);
  const active = sessions.filter(Boolean);
  assert.equal(active.length, 1);
  const { token } = active[0];
  assert.equal((await findActiveSession(database, token, 105)).subscriberId, "member");
  assert.notEqual(sql.prepare("SELECT token_digest FROM subscriber_session").get().token_digest, token);

  sql.exec("UPDATE subscriber SET state = 'suspended'");
  assert.equal(await findActiveSession(database, token, 106), null);
  assert.equal(await issueVerifiedSession(database, { ...request, now: 201, expiresAt: 300 }), null);
  sql.exec("UPDATE subscriber SET state = 'active'");
  assert.equal(await findActiveSession(database, token, 107), null);
});

test("expiry and logout permit replacement without reviving old tokens", async t => {
  const { database } = databaseForTest(t);
  const issue = (now, expiresAt) => issueVerifiedSession(database, { subscriberId: "member", now, expiresAt });
  const first = await issue(104, 110);
  assert.equal(await findActiveSession(database, first.token, 110), null);
  const second = await issue(110, 120);
  assert.equal(await revokeSession(database, second.token, 111), true);
  assert.equal(await revokeSession(database, second.token, 112), false);
  const third = await issue(112, 130);
  assert.equal(await findActiveSession(database, second.token, 113), null);
  assert.equal((await findActiveSession(database, third.token, 113)).subscriberId, "member");
});
