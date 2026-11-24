const categories = new Set(["supplier", "retailer", "courier", "consumer"]);
const encoder = new TextEncoder();

async function identityDigest(key, value) {
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode("national-id:" + value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

// The server must construct actor from an independently authenticated MFA
// principal. No browser-supplied role or administrator ID may reach this layer.
function audit(database, actor, action, subscriberId, now) {
  if (!actor?.administratorId || actor.mfaVerified !== true
    || !Number.isSafeInteger(now) || now < 0) throw new Error("administrator access denied");
  const id = crypto.randomUUID();
  const statement = database.prepare(`
    INSERT INTO administrator_access_event (id, administrator_id, subscriber_id, action, occurred_at)
    SELECT ?1, administrator_id, ?4, permission, ?5 FROM administrator_permission
    WHERE administrator_id = ?2 AND permission = ?3
    RETURNING id
  `).bind(id, actor.administratorId, action, subscriberId, now);
  return { id, statement };
}

export async function searchSubscribers(database, actor, {
  role = null, text = "", nationalId = null, after = "", limit = 20,
}, { now, identityKey }) {
  if ((role !== null && !categories.has(role)) || typeof text !== "string" || text.length > 200
    || typeof after !== "string" || !Number.isInteger(limit) || limit < 1 || limit > 50
    || (nationalId !== null && (typeof nationalId !== "string" || !/^[0-9]{14}$/.test(nationalId)))) {
    throw new TypeError("invalid subscriber search");
  }
  const entry = audit(database, actor, nationalId === null ? "subscriber_search" : "identity_search", null, now);
  const digest = nationalId === null ? null : await identityDigest(identityKey, nationalId);
  const [access, page] = await database.batch([entry.statement, database.prepare(`
    SELECT account.id AS subscriberId, account.role, account.state, account.full_name AS fullName,
      business.name AS businessName
    FROM subscriber AS account
    LEFT JOIN subscriber_business AS business ON business.subscriber_id = account.id
    WHERE EXISTS (SELECT 1 FROM administrator_access_event WHERE id = ?1)
      AND (?2 IS NULL OR account.role = ?2) AND account.id > ?3
      AND ((?4 IS NOT NULL AND account.id IN (
          SELECT subscriber_id FROM subscriber_identity_lookup WHERE lookup_digest = ?4
        )) OR (?4 IS NULL AND (?5 = '' OR account.id = ?5 OR account.phone = ?5
          OR instr(lower(account.full_name), lower(?5)) > 0 OR instr(lower(business.name), lower(?5)) > 0)))
    ORDER BY account.id LIMIT ?6
  `).bind(entry.id, role, after, digest, text.trim(), limit + 1)]);
  if (!access.results.length) throw new Error("administrator access denied");
  const subscribers = page.results.slice(0, limit);
  return { subscribers, next: page.results.length > limit ? subscribers.at(-1).subscriberId : null };
}

export async function listArchiveDocuments(database, actor, subscriberId, { now, after = "", limit = 20 }) {
  if (typeof subscriberId !== "string" || !subscriberId || typeof after !== "string"
    || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError("invalid archive query");
  const entry = audit(database, actor, "archive_read", subscriberId, now);
  const [access, page] = await database.batch([entry.statement, database.prepare(`
    SELECT id, kind, version, uploaded_at AS uploadedAt FROM subscriber_archive_document
    WHERE subscriber_id = ?1 AND id > ?2
      AND EXISTS (SELECT 1 FROM administrator_access_event WHERE id = ?3)
    ORDER BY id LIMIT ?4
  `).bind(subscriberId, after, entry.id, limit + 1)]);
  if (!access.results.length) throw new Error("administrator access denied");
  const documents = page.results.slice(0, limit);
  return { documents, next: page.results.length > limit ? documents.at(-1).id : null };
}

export async function openSupportCase(database, actor, {
  subscriberId, orderId = null, kind, category = null, description, now,
}) {
  if (!["complaint", "violation"].includes(kind)
    || typeof description !== "string" || !description.trim()
    || (category !== null && (typeof category !== "string" || !category.trim()))) {
    throw new TypeError("invalid support case");
  }
  const entry = audit(database, actor, "support_write", subscriberId, now);
  const caseId = crypto.randomUUID();
  const [access, created] = await database.batch([
    entry.statement,
    database.prepare(`
      INSERT INTO subscriber_support_case
        (id, subscriber_id, order_id, kind, category, description, administrator_id, created_at)
      SELECT ?2, subscriber_id, ?3, ?4, ?5, ?6, administrator_id, occurred_at
      FROM administrator_access_event WHERE id = ?1
        AND (?3 IS NULL OR EXISTS (
          SELECT 1 FROM commerce_order WHERE id = ?3
            AND (buyer_id = subscriber_id OR seller_id = subscriber_id)
        ))
      RETURNING id
    `).bind(entry.id, caseId, orderId, kind, category, description.trim()),
  ]);
  if (!access.results.length) throw new Error("administrator access denied");
  return created.results.length ? { caseId } : null;
}

export async function recordSupportAction(database, actor, {
  subscriberId, caseId, kind, details, now,
}) {
  if (!["note", "appeal", "resolution"].includes(kind) || typeof details !== "string" || !details.trim()) {
    throw new TypeError("invalid support action");
  }
  const entry = audit(database, actor, "support_write", subscriberId, now);
  const [access, action] = await database.batch([entry.statement, database.prepare(`
    INSERT INTO subscriber_support_action (id, case_id, administrator_id, kind, details, occurred_at)
    SELECT ?2, support.id, event.administrator_id, ?4, ?5, event.occurred_at
    FROM administrator_access_event AS event
    JOIN subscriber_support_case AS support ON support.subscriber_id = event.subscriber_id
    WHERE event.id = ?1 AND support.id = ?3
    RETURNING id
  `).bind(entry.id, crypto.randomUUID(), caseId, kind, details.trim())]);
  if (!access.results.length) throw new Error("administrator access denied");
  return action.results[0]?.id ?? null;
}
