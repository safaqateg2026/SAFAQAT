import { listArchiveDocuments } from "./administration.mjs";

const validId = value =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);

const sections = Object.freeze({
  orders: `
    SELECT id, state, created_at AS createdAt,
      CASE WHEN buyer_id = ?1 THEN 'purchase'
        ELSE 'sale' END AS kind
    FROM commerce_order
    WHERE (buyer_id = ?1 OR seller_id = ?1)
  `,
  invoices: `
    SELECT invoice.id, total.order_id AS orderId,
      total.completed_at AS completedAt,
      CAST(total.total_minor AS TEXT) AS totalMinor,
      total.currency,
      CASE WHEN total.buyer_id = ?1 THEN 'purchase'
        ELSE 'sale' END AS kind
    FROM order_invoice AS invoice
    JOIN completed_order_total AS total
      ON total.order_id = invoice.order_id
    WHERE (total.buyer_id = ?1 OR total.seller_id = ?1)
      AND total.completed_at >= ?5
  `,
  activity: `
    SELECT id, actor_type AS actorType,
      event_type AS eventType,
      occurred_at AS occurredAt
    FROM subscriber_audit_event
    WHERE subscriber_id = ?1
  `,
  reviews: `
    SELECT id, decision, reason,
      reviewed_at AS reviewedAt
    FROM subscriber_verification_review
    WHERE subscriber_id = ?1
  `,
  support: `
    SELECT id, order_id AS orderId, kind,
      category, description, created_at AS createdAt
    FROM subscriber_support_case
    WHERE subscriber_id = ?1
  `
});

export async function readSubscriberHistory(
  database,
  actor,
  subscriberId,
  {
    section,
    now,
    after = "",
    limit = 20,
    invoiceVisibleFrom
  }
) {
  if (
    !validId(subscriberId) ||
    (after !== "" && !validId(after)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 || limit > 50 ||
    !Number.isSafeInteger(now) || now < 0
  ) {
    throw new TypeError("invalid history query");
  }

  if (!actor?.administratorId ||
      actor.mfaVerified !== true) {
    throw new Error("administrator access denied");
  }

  if (section === "archive") {
    const page = await listArchiveDocuments(
      database, actor, subscriberId,
      { now, after, limit }
    );
    return {
      section,
      records: page.documents,
      next: page.next
    };
  }

  if (!Object.hasOwn(sections, section)) {
    throw new TypeError("invalid history section");
  }

  if (section === "invoices" &&
      (!Number.isSafeInteger(invoiceVisibleFrom) ||
       invoiceVisibleFrom < 0 ||
       invoiceVisibleFrom > now)) {
    throw new TypeError("invoice visibility policy required");
  }

  const eventId = crypto.randomUUID();

  const audit = database.prepare(`
    INSERT INTO administrator_access_event
      (id, administrator_id, subscriber_id, action, occurred_at)
    SELECT ?1, permission.administrator_id,
      account.id, 'subscriber_search', ?4
    FROM administrator_permission AS permission
    JOIN subscriber AS account ON account.id = ?3
    WHERE permission.administrator_id = ?2
      AND permission.permission = 'subscriber_search'
      AND EXISTS (
        SELECT 1 FROM administrator_permission
        WHERE administrator_id = ?2
          AND permission = 'identity_search'
      )
      AND (
        ?5 <> 'support' OR EXISTS (
          SELECT 1 FROM administrator_permission
          WHERE administrator_id = ?2
            AND permission = 'support_write'
        )
      )
    RETURNING id
  `).bind(
    eventId, actor.administratorId,
    subscriberId, now, section
  );

  const statement = database.prepare(`
    SELECT * FROM (${sections[section]}) AS records
    WHERE records.id > ?2
      AND EXISTS (
        SELECT 1 FROM administrator_access_event
        WHERE id = ?3 AND subscriber_id = ?1
      )
    ORDER BY records.id
    LIMIT ?4
  `);

  const args = [
    subscriberId, after, eventId, limit + 1
  ];

  if (section === "invoices") {
    args.push(invoiceVisibleFrom);
  }

  const [access, page] = await database.batch([
    audit,
    statement.bind(...args)
  ]);

  if (!access.results.length) {
    throw new Error("administrator access denied");
  }

  const records = page.results.slice(0, limit);

  return {
    section,
    records,
    next: page.results.length > limit
      ? records.at(-1).id : null
  };
}
