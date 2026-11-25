import assert from "node:assert/strict";
import test from "node:test";
import { openSupportCase, recordSupportAction, searchSubscribers } from "../administration.mjs";
import { saveCoverage } from "../coverage.mjs";
import { cumulativeOrderTotals, listInvoices, readInvoice, recordCompletedOrder } from "../invoices.mjs";
import { requiredPolicies, saveRegistration } from "../registration.mjs";
import { addFavorite, discoverRetailers, readRetailerDetails, removeFavorite } from "../retailerDiscovery.mjs";
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
  assert.equal(await readRetailerDetails(database, consumer, location, excluded.subscriberId), null);
  const details = await readRetailerDetails(database, consumer, location, near.subscriberId);
  assert.equal(details.activityCode, "synthetic");
  assert.equal(details.latitude, undefined);
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
  const outsider = await register(database, "consumer", 2);
  activate(sql, outsider.subscriberId);
  const outcomes = await Promise.all([recordCompletedOrder(database, input), recordCompletedOrder(database, input)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  const completed = outcomes.find(Boolean);
  assert.equal(completed.totalMinor, 375);
  assert.equal(await readInvoice(database, outsider, completed.invoiceId, { visibleFrom: 0 }), null);
  assert.equal(await readInvoice(database, buyer, completed.invoiceId, { visibleFrom: 111 }), null);
  const invoice = await readInvoice(database, seller, completed.invoiceId, { visibleFrom: 0 });
  assert.equal(invoice.kind, "sale");
  assert.equal(invoice.lines[0].lineMinor, "375");
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

test("account HTTP routes authenticate from cookies and isolate invoices and logout", async t => {
  const { database, sql } = databaseForTest(t);
  const { createAccountApi } = await import("../accountApi.mjs");
  const { issueVerifiedSession } = await import("../sessions.mjs");
  const buyer = await register(database, "consumer", 0);
  const seller = await register(database, "retailer", 1);
  const outsider = await register(database, "consumer", 2);
  for (const account of [buyer, seller, outsider]) activate(sql, account.subscriberId);
  const session = account => issueVerifiedSession(database, { ...account, now: 102, expiresAt: 200 });
  const cookie = value => writeSessionCookie(value, 102).split(";")[0];
  const buyerCookie = cookie(await session(buyer));
  const outsiderCookie = cookie(await session(outsider));
  sql.prepare("INSERT INTO commerce_order VALUES ('order-api', ?, ?, 'pending', 102)").run(buyer.subscriberId, seller.subscriberId);
  const { invoiceId } = await recordCompletedOrder(database, { orderId: "order-api", now: 103, lines: [
    { productId: "prod", productName: "Synthetic", quantity: 1, unitMinor: 100 },
  ] });
  const origin = "https://safaqat.test";
  const options = { database, origin, clock: () => 104 };
  const api = createAccountApi({ ...options, invoiceVisibleFrom: () => 100 });
  const request = (path, headers, method = "GET") => new Request(origin + "/api/account/" + path, { headers, method });
  const path = "invoices/" + invoiceId;
  assert.equal((await api(request(path))).status, 401);
  assert.equal((await api(request(path + "?subscriberId=" + buyer.subscriberId, { Cookie: outsiderCookie }))).status, 404);
  assert.equal((await createAccountApi(options)(request(path, { Cookie: buyerCookie }))).status, 404);
  const invoice = await api(request(path, { Cookie: buyerCookie }));
  assert.equal(invoice.status, 200);
  assert.equal(invoice.headers.get("cache-control"), "private, no-store");
  assert.equal((await invoice.json()).totalMinor, "100");
  assert.equal((await api(request("invoices?limit=900", { Cookie: buyerCookie }))).status, 400);
  assert.equal((await api(request("logout", { Cookie: buyerCookie }, "POST"))).status, 403);
  assert.equal((await api(request("session", { Cookie: buyerCookie }))).status, 200);
  const loggedOut = await api(request("logout", { Cookie: buyerCookie, Origin: origin }, "POST"));
  assert.equal(loggedOut.status, 204);
  assert.match(loggedOut.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await api(request("session", { Cookie: buyerCookie }))).status, 401);
});

test("unified dossier enforces MFA, permissions and account isolation", async t => {
  const { database, sql } = databaseForTest(t);
  const { readSubscriberDossier } = await import("../subscriberDossier.mjs");

  const merchant = await register(database, "retailer", 0);
  const consumer = await register(database, "consumer", 1);
  const courier = await register(database, "courier", 2);

  const actor = {
    administratorId: "dossier-test-admin",
    mfaVerified: true
  };

  const read = (id, principal = actor) =>
    readSubscriberDossier(database, principal, id, { now: 105 });

  await assert.rejects(read(merchant.subscriberId), /access denied/);

  sql.prepare("INSERT INTO administrator_permission VALUES (?, ?)")
    .run(actor.administratorId, "subscriber_search");

  await assert.rejects(read(merchant.subscriberId), /access denied/);

  sql.prepare("INSERT INTO administrator_permission VALUES (?, ?)")
    .run(actor.administratorId, "identity_search");

  await assert.rejects(
    read(merchant.subscriberId, { ...actor, mfaVerified: false }),
    /access denied/
  );

  const merchantFile = await read(merchant.subscriberId);
  assert.equal(merchantFile.account.subscriberId, merchant.subscriberId);
  assert.equal(merchantFile.account.role, "retailer");
  assert.ok(merchantFile.business);
  assert.equal(merchantFile.vehicle, undefined);
  assert.equal(merchantFile.contacts.phoneVerified, false);

  const consumerFile = await read(consumer.subscriberId);
  assert.equal(consumerFile.account.role, "consumer");
  assert.equal(consumerFile.business, undefined);
  assert.equal(consumerFile.vehicle, undefined);

  const courierFile = await read(courier.subscriberId);
  assert.equal(courierFile.account.role, "courier");
  assert.ok(courierFile.vehicle);
  assert.equal(courierFile.business, undefined);

  const serialized = JSON.stringify(merchantFile);
  assert.equal(serialized.includes("token_digest"), false);
  assert.equal(serialized.includes("object_key"), false);
  assert.equal(serialized.includes("proof_digest"), false);

  const events = sql.prepare(`
    SELECT count(*) AS n FROM administrator_access_event
    WHERE administrator_id = ?
  `).get(actor.administratorId);

  assert.equal(events.n, 3);
});

test("subscriber history protects private records and bounds pagination", async t => {
  const { database, sql } = databaseForTest(t);
  const { readSubscriberHistory } =
    await import("../subscriberHistory.mjs");

  const buyer = await register(database, "consumer", 0);
  const seller = await register(database, "retailer", 1);
  const outsider = await register(database, "consumer", 2);

  const actor = {
    administratorId: "history-test-admin",
    mfaVerified: true
  };

  const read = (id, section, options = {}) =>
    readSubscriberHistory(database, actor, id, {
      section, now: 110, ...options
    });

  await assert.rejects(
    read(buyer.subscriberId, "orders"),
    /access denied/
  );

  for (const permission of [
    "subscriber_search", "identity_search"
  ]) {
    sql.prepare(
      "INSERT INTO administrator_permission VALUES (?, ?)"
    ).run(actor.administratorId, permission);
  }

  for (const id of ["order-a", "order-b", "order-c"]) {
    sql.prepare(
      "INSERT INTO commerce_order VALUES (?, ?, ?, 'pending', 102)"
    ).run(id, buyer.subscriberId, seller.subscriberId);
  }

  const first = await read(
    buyer.subscriberId, "orders", { limit: 2 }
  );

  assert.equal(first.records.length, 2);
  assert.equal(first.next, "order-b");

  const second = await read(
    buyer.subscriberId, "orders",
    { limit: 2, after: first.next }
  );

  assert.equal(second.records.length, 1);
  assert.equal(second.records[0].id, "order-c");
  assert.equal(second.next, null);

  const isolated = await read(
    outsider.subscriberId, "orders"
  );

  assert.deepEqual(isolated.records, []);

  await assert.rejects(
    read(buyer.subscriberId, "orders", { limit: 51 }),
    /invalid history query/
  );

  await assert.rejects(
    read(buyer.subscriberId, "invoices"),
    /visibility policy required/
  );

  await assert.rejects(
    read(seller.subscriberId, "archive"),
    /access denied/
  );

  await assert.rejects(
    read(seller.subscriberId, "support"),
    /access denied/
  );

  sql.prepare(
    "INSERT INTO administrator_permission VALUES (?, ?)"
  ).run(actor.administratorId, "archive_read");

  const archive = await read(
    seller.subscriberId, "archive"
  );

  assert.deepEqual(archive.records, []);

  sql.prepare(
    "INSERT INTO administrator_permission VALUES (?, ?)"
  ).run(actor.administratorId, "support_write");

  const support = await read(
    seller.subscriberId, "support"
  );

  assert.deepEqual(support.records, []);

  const activity = await read(
    buyer.subscriberId, "activity"
  );

  assert.ok(activity.records.some(
    event => event.eventType === "registered"
  ));

  const reviews = await read(
    seller.subscriberId, "reviews"
  );

  assert.deepEqual(reviews.records, []);

  const invoices = await read(
    buyer.subscriberId, "invoices",
    { invoiceVisibleFrom: 0 }
  );

  assert.deepEqual(invoices.records, []);
});

test("admin API requires trusted MFA and isolates subscriber data", async t => {
  const { database, sql } = databaseForTest(t);
  const { createAdminApi } = await import("../adminApi.mjs");

  const buyer = await register(database, "consumer", 0);
  const seller = await register(database, "retailer", 1);

  const actor = {
    administratorId: "api-test-admin",
    mfaVerified: true
  };

  let principal = null;

  const handle = createAdminApi({
    database,
    authenticateAdministrator: async () => principal,
    clock: () => 110,
    invoiceVisibleFrom: () => 0
  });

  const base = "https://admin.example.test/api/admin/subscribers";

  const request = (path = "", options = {}) =>
    handle(new Request(base + path, options));

  assert.equal((await request()).status, 401);

  assert.equal((await request("", {
    headers: {
      "X-Administrator-Id": actor.administratorId,
      "X-MFA-Verified": "true"
    }
  })).status, 401);

  principal = { ...actor, mfaVerified: false };
  assert.equal((await request()).status, 401);

  principal = actor;
  assert.equal((await request()).status, 403);

  for (const permission of [
    "subscriber_search", "identity_search"
  ]) {
    sql.prepare(
      "INSERT INTO administrator_permission VALUES (?, ?)"
    ).run(actor.administratorId, permission);
  }

  const search = await request("?role=retailer");
  assert.equal(search.status, 200);
  assert.equal(search.headers.get("Cache-Control"), "private, no-store");

  const page = await search.json();
  assert.equal(page.subscribers.length, 1);
  assert.equal(page.subscribers[0].subscriberId, seller.subscriberId);
  assert.equal(page.subscribers[0].phone, undefined);

  const dossier = await request("/" + buyer.subscriberId);
  assert.equal(dossier.status, 200);
  assert.equal(
    (await dossier.json()).account.subscriberId,
    buyer.subscriberId
  );

  assert.equal((await request(
    "/" + buyer.subscriberId + "/orders"
  )).status, 200);

  assert.equal((await request(
    "/" + buyer.subscriberId + "/archive"
  )).status, 403);

  assert.equal((await request("?limit=51")).status, 400);
  assert.equal((await request("?limit=2&limit=3")).status, 400);
  assert.equal((await request("", { method: "POST" })).status, 405);

  assert.equal((await request("", {
    headers: { Origin: "https://untrusted.example.test" }
  })).status, 403);

  assert.equal((await handle(new Request(
    base.replace("https:", "http:")
  ))).status, 403);
});


test("WhatsApp registration integrates signed events with single-use database challenges", async t => {
  const { database, sql } = databaseForTest(t);

  const { createVerificationChallenge } =
    await import("../verification.mjs");

  const { createWhatsAppRegistrationHandler } =
    await import("../providers/whatsappRegistration.mjs");

  const { createHmac } = await import("node:crypto");

  const first = await register(database, "consumer", 0);
  const second = await register(database, "consumer", 1);

  const findMember = sql.prepare(
    "SELECT id, phone, state, phone_verified_at FROM subscriber WHERE id = ?"
  );

  const member = findMember.get(first.subscriberId);
  const other = findMember.get(second.subscriberId);

  assert.ok(member);
  assert.ok(other);

  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const config = {
    appSecret: "synthetic-registration-test-secret-only",
    businessAccountId: "100001",
    phoneNumberId: "100002"
  };

  let now = 105;

  const handler = createWhatsAppRegistrationHandler({
    database, key, config,
    clock: () => now
  });

  async function issue(purpose = "registration") {
    return createVerificationChallenge(database, key, {
      subscriberId: member.id,
      purpose,
      channel: "whatsapp",
      target: member.phone,
      now: 103,
      expiresAt: 120
    });
  }

  function request(challenge, {
    sender = member.phone,
    purpose = "registration",
    valid = true,
    messageId = "wamid.synthetic-registration",
    destination = config.phoneNumberId
  } = {}) {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: config.businessAccountId,
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              phone_number_id: destination
            },
            messages: [{
              id: messageId,
              from: sender.replace(/^\+/, ""),
              type: "text",
              text: {
                body: `SAFAQAT ${purpose} ${challenge.id} ${challenge.proof}`
              }
            }]
          }
        }]
      }]
    };

    const body = JSON.stringify(payload);

    const signature = createHmac(
      "sha256", config.appSecret
    ).update(body).digest("hex");

    return new Request(
      "https://example.test/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256":
            "sha256=" + (valid
              ? signature
              : "0".repeat(64))
        },
        body
      }
    );
  }

  const challenge = await issue();
  assert.ok(challenge);

  assert.equal(
    await handler(request(challenge, { valid: false })),
    null
  );

  assert.deepEqual(
    await handler(request(challenge, { sender: other.phone })),
    { accepted: 0 }
  );

  assert.deepEqual(
    await handler(request(challenge, { destination: "999999" })),
    { accepted: 0 }
  );

  assert.deepEqual(
    await handler(request({
      ...challenge,
      proof: "0".repeat(64)
    })),
    { accepted: 0 }
  );

  assert.deepEqual(
    await handler(request(challenge, { purpose: "login" })),
    { accepted: 0 }
  );

  assert.equal(
    findMember.get(member.id).phone_verified_at, null
  );

  assert.equal(
    findMember.get(other.id).phone_verified_at, null
  );

  assert.deepEqual(
    await handler(request(challenge)),
    { accepted: 1 }
  );

  assert.deepEqual(
    await handler(request(challenge)),
    { accepted: 0 }
  );

  assert.deepEqual(
    await handler(request(challenge, {
      messageId: "wamid.synthetic-replay"
    })),
    { accepted: 0 }
  );

  assert.equal(
    findMember.get(member.id).phone_verified_at, 105
  );

  assert.equal(
    findMember.get(other.id).phone_verified_at, null
  );

  const receipt = sql.prepare(
    "SELECT COUNT(*) AS total FROM subscriber_registration_contact_receipt WHERE subscriber_id = ?"
  ).get(member.id);

  assert.equal(receipt.total, 1);

  const expired = await issue();
  assert.ok(expired);

  now = 120;

  assert.deepEqual(
    await handler(request(expired)),
    { accepted: 0 }
  );

  const login = await issue("login");
  assert.ok(login);

  now = 106;

  assert.deepEqual(
    await handler(request(login, { purpose: "login" })),
    { accepted: 0 }
  );

  const recovery = await issue("recovery");
  assert.ok(recovery);

  assert.deepEqual(
    await handler(request(recovery, { purpose: "recovery" })),
    { accepted: 0 }
  );

  assert.notEqual(
    findMember.get(member.id).state, "active"
  );

  const limitedHandler = createWhatsAppRegistrationHandler({
    database, key, config,
    rateLimit: { windowSeconds: 60, limit: 1 },
    clock: () => now
  });

  const limited = await issue();
  assert.ok(limited);

  assert.deepEqual(
    await limitedHandler(request(limited)),
    { accepted: 0 }
  );

  now = 180;

  const renewed = await createVerificationChallenge(
    database, key, {
      subscriberId: member.id,
      purpose: "registration",
      channel: "whatsapp",
      target: member.phone,
      now,
      expiresAt: 240
    }
  );

  assert.ok(renewed);

  assert.deepEqual(
    await limitedHandler(request(renewed)),
    { accepted: 1 }
  );

  assert.equal(
    findMember.get(member.id).phone_verified_at, 105
  );

  const challengeState = sql.prepare(
    "SELECT consumed_at FROM subscriber_verification_challenge WHERE id = ?"
  );

  assert.equal(
    challengeState.get(renewed.id).consumed_at, 180
  );

  const renewedReceipt = sql.prepare(
    "SELECT subscriber_id, verified_at FROM subscriber_registration_contact_receipt WHERE challenge_id = ?"
  ).get(renewed.id);

  assert.ok(renewedReceipt);
  assert.equal(renewedReceipt.subscriber_id, member.id);
  assert.equal(renewedReceipt.verified_at, 180);

  const blocked = await createVerificationChallenge(
    database, key, {
      subscriberId: member.id,
      purpose: "registration",
      channel: "whatsapp",
      target: member.phone,
      now,
      expiresAt: 240
    }
  );

  assert.ok(blocked);

  assert.deepEqual(
    await limitedHandler(request(blocked)),
    { accepted: 0 }
  );

  assert.equal(
    challengeState.get(blocked.id).consumed_at, null
  );

  assert.equal(
    sql.prepare(
      "SELECT COUNT(*) AS total FROM subscriber_registration_contact_receipt WHERE challenge_id = ?"
    ).get(blocked.id).total,
    0
  );

  assert.equal(
    findMember.get(other.id).phone_verified_at, null
  );
});
