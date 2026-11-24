import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { findActiveSession, issueVerifiedSession, revokeSession } from "../sessions.mjs";

function databaseForTest(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  const migrations = new URL("../migrations/", import.meta.url);
  for (const migration of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) {
    sql.exec(readFileSync(new URL(migration, migrations), "utf8"));
  }
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

test("challenge consumption is single-use and bound to a verified sender and purpose", async t => {
  const { database } = databaseForTest(t);
  const { createVerificationChallenge, consumeVerifiedEvent } = await import("../verification.mjs");
  const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const target = "+201000000000";
  const issue = (now, expiresAt) => createVerificationChallenge(database, key,
    { subscriberId: "member", purpose: "login", channel: "whatsapp", target, now, expiresAt });
  const { id, proof } = await issue(104, 120);
  const event = { id, proof, sender: target, purpose: "login", channel: "whatsapp" };
  assert.equal(await consumeVerifiedEvent(database, key, { ...event, sender: "+201000000001" }, 105), null);
  assert.equal(await consumeVerifiedEvent(database, key, { ...event, purpose: "registration" }, 105), null);
  const claims = await Promise.all([
    consumeVerifiedEvent(database, key, event, 106),
    consumeVerifiedEvent(database, key, event, 106),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(claims.find(Boolean).subscriberId, "member");

  const expired = await issue(110, 115);
  assert.equal(await consumeVerifiedEvent(database, key, { ...event, ...expired }, 115), null);
});

test("a consumed registration challenge verifies only its matching contact and records one receipt", async t => {
  const { database, sql } = databaseForTest(t);
  const { createVerificationChallenge, consumeVerifiedEvent } = await import("../verification.mjs");
  sql.exec("UPDATE subscriber SET state = 'incomplete', phone_verified_at = NULL, email = 'new@example.test'");
  const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const claim = async (channel, target) => {
    const challenge = await createVerificationChallenge(database, key, {
      subscriberId: "member", purpose: "registration", channel, target, now: 103, expiresAt: 110,
    });
    return { ...challenge, channel, purpose: "registration", sender: target };
  };
  const email = await claim("email", "new@example.test");
  assert.equal((await consumeVerifiedEvent(database, key, email, 104)).subscriberId, "member");
  assert.equal(await consumeVerifiedEvent(database, key, email, 105), null);
  let contact = sql.prepare("SELECT phone_verified_at, email_verified_at, state FROM subscriber").get();
  assert.deepEqual(Object.values(contact), [null, 104, "incomplete"]);

  const phone = await claim("whatsapp", "+201000000000");
  sql.exec("UPDATE subscriber SET phone = '+201000000001'");
  assert.equal(await consumeVerifiedEvent(database, key, phone, 106), null);
  const currentPhone = await claim("whatsapp", "+201000000001");
  await consumeVerifiedEvent(database, key, currentPhone, 107);
  contact = sql.prepare("SELECT phone_verified_at, email_verified_at, state FROM subscriber").get();
  assert.deepEqual(Object.values(contact), [107, 104, "incomplete"]);
  assert.deepEqual(sql.prepare("SELECT channel FROM subscriber_registration_contact_receipt ORDER BY verified_at")
    .all().map(row => row.channel), ["email", "whatsapp"]);
});

test("rate limits bound attempts per action without resetting on a stale clock", async t => {
  const { database } = databaseForTest(t);
  const { reserveAuthAttempt } = await import("../authRateLimit.mjs");
  const options = { subjectDigest: "a".repeat(64), action: "challenge_issue", windowSeconds: 10, limit: 2 };
  const attempt = (now, overrides) => reserveAuthAttempt(database, { ...options, now, ...overrides });
  const decisions = await Promise.all([attempt(101), attempt(101), attempt(101)]);
  assert.equal(decisions.filter(Boolean).length, 2);
  assert.equal(await attempt(109), false);
  assert.equal(await attempt(109, { action: "challenge_verify" }), true);
  assert.equal(await attempt(110), true);
  assert.equal(await attempt(109), false);
  assert.equal(await attempt(111), true);
  assert.equal(await attempt(112), false);
});
