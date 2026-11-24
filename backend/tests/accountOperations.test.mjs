import assert from "node:assert/strict";
import test from "node:test";
import { openSupportCase, recordSupportAction, searchSubscribers } from "../administration.mjs";
import { saveCoverage } from "../coverage.mjs";
import { cumulativeOrderTotals, listInvoices, recordCompletedOrder } from "../invoices.mjs";
import { requiredPolicies, saveRegistration } from "../registration.mjs";
import { addFavorite, discoverRetailers, removeFavorite } from "../retailerDiscovery.mjs";
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from "../sessionCookie.mjs";
import { databaseForTest } from "./sqliteAdapter.mjs";

const district = { governorateCode: "test", districtCode: "first" };
const location = { ...district, latitude: 30, longitude: 31 };
const catalogs = {
  today: "2026-11-24",
  districts: new Map([["test", new Set(["first", "second"])]]),
  activities: new Set(["synthetic"]),
  policyVersions: new Map(["terms", "privacy", "commission", "sales_purchase", "delivery"].map(
    policy => [policy, "test"],
  )),
};

async function register(database, role, phoneSuffix, extra = {}) {
  const phone = "+20100000000" + phoneSuffix;
  return saveRegistration(database, {
    ...location, role, phone, fullName: "Synthetic " + role, address: "Synthetic address",
    email: role === "consumer" ? null : phoneSuffix + "@example.test", birthDate: "1990-01-01",
    business: { name: "Synthetic shop " + phoneSuffix, activityCode: "synthetic", premisesAddress: "Synthetic shop" },
    delivery: { vehicleType: "rider" },
    policyVersions: Object.fromEntries(requiredPolicies(role).map(policy => [policy, "test"])),
    ...extra,
  }, catalogs, 100);
}

function activate(sql, subscriberId) {
  const account = sql.prepare("SELECT role FROM subscriber WHERE id = ?").get(subscriberId);
  if (account.role !== "consumer") {
    sql.prepare("INSERT INTO subscriber_verification_review VALUES (?, ?, 'admin', 'approved', NULL, 101)")
      .run(crypto.randomUUID(), subscriberId);
  }
  sql.prepare(`
    UPDATE subscriber SET phone_verified_at = 101, email_verified_at = CASE WHEN email IS NOT NULL THEN 101 END,
      state = 'active' WHERE id = ?
  `).run(subscriberId);
}

test("four registration roles persist only appropriate profiles, policies and audit events", async t => {
  const { database, sql } = databaseForTest(t);
  for (const [index, role] of ["supplier", "retailer", "consumer", "courier"].entries()) {
    const { subscriberId } = await register(database, role, index);
    const row = sql.prepare("SELECT role, state FROM subscriber WHERE id = ?").get(subscriberId);
    assert.equal(row.role, role);
    assert.equal(row.state, "incomplete");
  }
  await assert.rejects(register(database, "consumer", 1), /UNIQUE/);
  assert.deepEqual(await register(database, "retailer", 5, { email: null }), { issues: ["emailRequired"] });
  for (const [table, count] of Object.entries({
    subscriber: 4, subscriber_business: 2, subscriber_delivery: 1,
    retailer_directory_identity: 1, subscriber_audit_event: 4, subscriber_policy_acceptance: 17,
  })) {
    assert.equal(sql.prepare("SELECT count(*) AS n FROM " + table).get().n, count);
  }
});

test("coverage gates code and name discovery, nearest paging and consumer favorites", async t => {
  const { database, sql } = databaseForTest(t);
  const consumer = await register(database, "consumer", 0);
  const near = await register(database, "retailer", 1);
  const far = await register(database, "retailer", 2, { latitude: 30.1 });
  const excluded = await register(database, "retailer", 3, { latitude: 30.01 });
  for (const account of [consumer, near, far, excluded]) activate(sql, account.subscriberId);
  const coverage = { ...district, mode: "districts", districts: ["first"] };
  await saveCoverage(database, near, coverage, catalogs);
  await saveCoverage(database, far, { ...coverage, mode: "radius", center: { ...location, latitude: 30.1 },
    radiusMeters: 12000 }, { ...catalogs, containsPoint: () => true });
  await saveCoverage(database, excluded, { ...coverage, districts: ["second"] }, catalogs);
  assert.equal(await saveCoverage(database, consumer, coverage, catalogs), false);

  const page = await discoverRetailers(database, consumer, location, { limit: 1 });
  assert.equal(page.retailers[0].retailerId, near.subscriberId);
  assert.equal(page.retailers[0].distanceMeters, 0);
  const next = await discoverRetailers(database, consumer, location, { after: page.next });
  assert.equal(next.retailers[0].retailerId, far.subscriberId);
  assert.deepEqual((await discoverRetailers(database, consumer, location, { search: excluded.subscriberId })).retailers, []);
  assert.deepEqual((await discoverRetailers(database, consumer, location, { search: "shop 3" })).retailers, []);
  assert.deepEqual((await discoverRetailers(database, near, location)).retailers, []);
  assert.equal(await addFavorite(database, consumer, location, excluded.subscriberId, 103), false);
  assert.equal(await addFavorite(database, consumer, location, near.subscriberId, 103), true);
  assert.equal(await addFavorite(database, consumer, location, near.subscriberId, 104), false);
  assert.equal((await discoverRetailers(database, consumer, location, { favoritesOnly: true })).retailers.length, 1);
  assert.equal(await removeFavorite(database, near, near.subscriberId), false);
  assert.equal(await removeFavorite(database, consumer, near.subscriberId), true);
});

test("invoice completion counts once and cancelled orders are excluded", async t => {
  const { database, sql } = databaseForTest(t);
  const buyer = await register(database, "retailer", 0);
  const seller = await register(database, "supplier", 1);
  activate(sql, buyer.subscriberId);
  activate(sql, seller.subscriberId);
  const insert = sql.prepare("INSERT INTO commerce_order VALUES (?, ?, ?, ?, 104)");
  insert.run("order", buyer.subscriberId, seller.subscriberId, "pending");
  insert.run("cancelled", buyer.subscriberId, seller.subscriberId, "cancelled");
  const input = { orderId: "order", now: 110, lines: [
    { productId: "product", productName: "Synthetic item", quantity: 3, unitMinor: 125 },
  ] };
  assert.equal(await recordCompletedOrder(database, { ...input, orderId: "cancelled" }), null);
  await assert.rejects(recordCompletedOrder(database, { ...input, lines: [
    { ...input.lines[0], unitMinor: Number.MAX_SAFE_INTEGER },
  ] }), /precision/);
  const outcomes = await Promise.all([recordCompletedOrder(database, input), recordCompletedOrder(database, input)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(outcomes.find(Boolean).totalMinor, 375);
  const { results } = await cumulativeOrderTotals(database, buyer);
  assert.equal(results[0].kind, "purchase");
  assert.equal(results[0].totalMinor, "375");
  assert.equal(results[0].orderCount, 1);
  assert.equal((await listInvoices(database, buyer, { visibleFrom: 110 })).invoices.length, 1);
  assert.equal((await listInvoices(database, buyer, { visibleFrom: 111 })).invoices.length, 0);
  assert.equal((await cumulativeOrderTotals(database, buyer)).results[0].totalMinor, "375");
  assert.equal(sql.prepare("SELECT count(*) AS n FROM order_invoice_line").get().n, 1);
});

test("administrative search requires MFA and permission and audits successful access", async t => {
  const { database, sql } = databaseForTest(t);
  await register(database, "consumer", 0);
  await register(database, "retailer", 1);
  const actor = { administratorId: "admin", mfaVerified: true };
  sql.exec("INSERT INTO administrator_permission VALUES ('admin', 'subscriber_search')");
  await assert.rejects(searchSubscribers(database, { ...actor, mfaVerified: false }, {}, { now: 105 }), /denied/);
  await assert.rejects(searchSubscribers(database, { ...actor, administratorId: "ungranted" }, {}, { now: 105 }), /denied/);
  const result = await searchSubscribers(database, actor, { role: "retailer", text: "shop" }, { now: 105 });
  assert.equal(result.subscribers.length, 1);
  assert.equal(result.subscribers[0].role, "retailer");
  assert.equal(result.subscribers[0].phone, undefined);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM administrator_access_event").get().n, 1);
});

test("session cookies are host-only, reject ambiguity and can be cleared", () => {
  const token = "a".repeat(64);
  const cookie = writeSessionCookie({ token, expiresAt: 110 }, 100);
  assert.match(cookie, /Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=10/);
  assert.equal(readSessionCookie(cookie), token);
  assert.equal(readSessionCookie(cookie + "; " + cookie), null);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test("verified consumer activates only with current policies and all supplied contacts", async t => {
  const { database } = databaseForTest(t);
  const { createAuthentication, activateVerifiedConsumer } = await import("../authentication.mjs");
  const { subscriberId } = await register(database, "consumer", 0, { email: "member@example.test" });
  const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const deliveries = new Map();
  const providers = new Map();
  for (const channel of ["whatsapp", "email"]) {
    providers.set(channel, {
      async deliver(delivery) { deliveries.set(channel, delivery); },
      async authenticate(payload) { return payload.authenticated ? payload.event : null; },
    });
  }
  const rate = { windowSeconds: 60, limit: 3 };
  const authentication = createAuthentication({
    database, key, providers, clock: () => 105,
    policy: { challengeSeconds: 60, sessionSeconds: 60, rateLimits: {
      challenge_issue: rate, challenge_verify: rate,
    } },
  });
  assert.equal(await activateVerifiedConsumer(database, subscriberId, catalogs.policyVersions, 105), false);
  for (const [channel, target] of [["whatsapp", "+201000000000"], ["email", "member@example.test"]]) {
    assert.equal(await authentication.requestChallenge({
      purpose: "registration", channel, target, subscriberId, rateSubject: "test-client",
    }), true);
    const { id, proof } = deliveries.get(channel);
    const event = { id, proof, purpose: "registration", sender: target };
    if (channel === "whatsapp") {
      assert.equal(await authentication.acceptProviderEvent(channel, { event }, { rateSubject: "provider" }), null);
    }
    assert.equal((await authentication.acceptProviderEvent(channel,
      { event, authenticated: true }, { rateSubject: "provider" })).subscriberId, subscriberId);
    if (channel === "whatsapp") {
      assert.equal(await activateVerifiedConsumer(database, subscriberId, catalogs.policyVersions, 105), false);
    }
  }
  const stale = new Map(catalogs.policyVersions).set("terms", "replaced");
  assert.equal(await activateVerifiedConsumer(database, subscriberId, stale, 105), false);
  assert.equal(await activateVerifiedConsumer(database, subscriberId, catalogs.policyVersions, 105), true);
  assert.equal(await activateVerifiedConsumer(database, subscriberId, catalogs.policyVersions, 105), false);
});

test("case actions require account ownership and administrative support permissions", async t => {
  const { database, sql } = databaseForTest(t);
  const { subscriberId } = await register(database, "consumer", 0);
  const other = await register(database, "consumer", 1);
  const actor = { administratorId: "admin", mfaVerified: true };
  const complaint = { subscriberId, kind: "complaint", description: "Synthetic complaint", now: 105 };
  await assert.rejects(openSupportCase(database, actor, complaint), /denied/);
  sql.exec("INSERT INTO administrator_permission VALUES ('admin', 'support_write')");
  const { caseId } = await openSupportCase(database, actor, complaint);
  const action = { caseId, kind: "resolution", details: "Synthetic resolution", now: 106 };
  assert.equal(await recordSupportAction(database, actor, { ...other, ...action }), null);
  assert.ok(await recordSupportAction(database, actor, { subscriberId, ...action }));
});

test("device recovery requires both current contacts and replaces the old session atomically", async t => {
  const { database, sql } = databaseForTest(t);
  const { createVerificationChallenge, recoverVerifiedDevice } = await import("../verification.mjs");
  const { issueVerifiedSession, findActiveSession } = await import("../sessions.mjs");
  const { subscriberId } = await register(database, "consumer", 0, { email: "member@example.test" });
  activate(sql, subscriberId);
  const old = await issueVerifiedSession(database, { subscriberId, now: 102, expiresAt: 200 });
  const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const events = [];
  for (const [channel, target] of [["whatsapp", "+201000000000"], ["email", "member@example.test"]]) {
    const purpose = "recovery";
    const { id, proof } = await createVerificationChallenge(database, key, {
      subscriberId, purpose, channel, target, now: 103, expiresAt: 120,
    });
    events.push({ id, proof, purpose, channel, sender: target });
  }
  const attempt = proofs => recoverVerifiedDevice(database, key, proofs, { subscriberId, now: 105, expiresAt: 250 });
  assert.equal(await attempt(events.slice(0, 1)), null);
  assert.equal(await attempt([events[0], { ...events[1], sender: "different@example.test" }]), null);
  assert.ok(await findActiveSession(database, old.token, 105));
  assert.equal(sql.prepare("SELECT count(*) AS n FROM subscriber_verification_challenge WHERE consumed_at IS NOT NULL").get().n, 0);
  const outcomes = await Promise.all([attempt(events), attempt(events)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(await findActiveSession(database, old.token, 105), null);
  assert.ok(await findActiveSession(database, outcomes.find(Boolean).token, 105));
  assert.equal(sql.prepare("SELECT count(*) AS n FROM subscriber_audit_event WHERE event_type = 'recovery_completed'").get().n, 1);
});

test("authorized suspension records its reason and revokes the existing session", async t => {
  const { database, sql } = databaseForTest(t);
  const { suspendSubscriber } = await import("../administration.mjs");
  const { issueVerifiedSession, findActiveSession } = await import("../sessions.mjs");
  const { subscriberId } = await register(database, "consumer", 0);
  activate(sql, subscriberId);
  const session = await issueVerifiedSession(database, { subscriberId, now: 102, expiresAt: 200 });
  const actor = { administratorId: "admin", mfaVerified: true };
  const request = { subscriberId, reason: "Synthetic reason", now: 103 };
  await assert.rejects(suspendSubscriber(database, actor, request), /denied/);
  assert.ok(await findActiveSession(database, session.token, 103));
  sql.exec("INSERT INTO administrator_permission VALUES ('admin', 'account_suspend')");
  assert.equal(await suspendSubscriber(database, actor, request), true);
  assert.equal(await suspendSubscriber(database, actor, request), false);
  assert.equal(await findActiveSession(database, session.token, 103), null);
  const record = sql.prepare("SELECT reason, previous_state FROM subscriber_suspension").get();
  assert.equal(record.reason, request.reason);
  assert.equal(record.previous_state, "active");
});

test("archive objects are streamed only to the owner and every successful read is audited", async t => {
  const { database, sql } = databaseForTest(t);
  const { readOwnArchiveDocument } = await import("../archive.mjs");
  const { issueVerifiedSession, revokeSession } = await import("../sessions.mjs");
  const owner = await register(database, "retailer", 0);
  const other = await register(database, "retailer", 1);
  for (const account of [owner, other]) activate(sql, account.subscriberId);
  const [ownerSession, otherSession] = await Promise.all([owner, other].map(account =>
    issueVerifiedSession(database, { ...account, now: 102, expiresAt: 200 })));
  const key = "a".repeat(64);
  sql.prepare("INSERT INTO subscriber_archive_document VALUES ('doc', ?, 'business_facade', ?, 1, 105)")
    .run(owner.subscriberId, key);
  let bucketCalls = 0;
  const bucket = {
    async get(path) {
      bucketCalls++;
      assert.equal(path, `retailer/${owner.subscriberId}/${key}`);
      return { body: new Response("Synthetic document").body };
    },
  };
  const read = token => readOwnArchiveDocument(database, bucket, { token, documentId: "doc", clock: () => 107 });
  assert.equal(await read(otherSession.token), null);
  assert.equal(bucketCalls, 0);
  const response = await read(ownerSession.token);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("content-disposition"), "attachment");
  assert.equal(await response.text(), "Synthetic document");
  await revokeSession(database, ownerSession.token, 107);
  assert.equal(await read(ownerSession.token), null);
  assert.equal(bucketCalls, 1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM subscriber_audit_event WHERE event_type = 'document_accessed'").get().n, 1);
});
