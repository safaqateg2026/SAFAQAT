// Accepts only the trusted order service's final line snapshot. This records
// completion and an invoice together without initiating payment or settlement.
export async function recordCompletedOrder(database, { orderId, lines, now }) {
  if (!Array.isArray(lines) || !lines.length || !Number.isSafeInteger(now) || now < 0) {
    throw new TypeError("invalid order completion");
  }
  let total = 0;
  const invoiceId = crypto.randomUUID();
  const lineStatements = lines.map((line, index) => {
    if (typeof line.productId !== "string" || !line.productId.trim()
      || typeof line.productName !== "string" || !line.productName.trim()
      || !Number.isSafeInteger(line.quantity) || line.quantity < 1
      || !Number.isSafeInteger(line.unitMinor) || line.unitMinor < 0) {
      throw new TypeError("invalid invoice line");
    }
    const lineTotal = line.quantity * line.unitMinor;
    total += lineTotal;
    if (!Number.isSafeInteger(total)) throw new RangeError("invoice total exceeds supported precision");
    return database.prepare(`
      INSERT INTO order_invoice_line
        (invoice_id, line_number, product_id, product_name, quantity, unit_minor, line_minor)
      SELECT id, ?2, ?3, ?4, ?5, ?6, ?7 FROM order_invoice WHERE id = ?1
    `).bind(invoiceId, index + 1, line.productId, line.productName, line.quantity, line.unitMinor, lineTotal);
  });

  // A new invoice is inserted only when the order has a completion record and
  // has never been invoiced. Completion, cumulative totals and lines roll back together.
  const [transition, , invoice] = await database.batch([
    database.prepare(`
      UPDATE commerce_order SET state = 'completed'
      WHERE id = ?1 AND state = 'pending' AND created_at <= ?2 RETURNING id
    `).bind(orderId, now),
    database.prepare(`
      INSERT INTO completed_order_total (order_id, buyer_id, seller_id, currency, total_minor, completed_at)
      SELECT id, buyer_id, seller_id, 'EGP', ?2, ?3 FROM commerce_order
      WHERE id = ?1 AND state = 'completed'
      ON CONFLICT (order_id) DO NOTHING
    `).bind(orderId, total, now),
    database.prepare(`
      INSERT INTO order_invoice (id, order_id)
      SELECT ?2, order_id FROM completed_order_total WHERE order_id = ?1
      ON CONFLICT (order_id) DO NOTHING RETURNING id
    `).bind(orderId, invoiceId),
    ...lineStatements,
  ]);
  return transition.results.length === 1 && invoice.results.length === 1 ? { invoiceId, totalMinor: total } : null;
}

export async function cumulativeOrderTotals(database, actor) {
  return database.prepare(`
    WITH entries AS (
      SELECT 'purchase' AS kind, total_minor, completed_at FROM completed_order_total WHERE buyer_id = ?1
      UNION ALL
      SELECT 'sale', total_minor, completed_at FROM completed_order_total WHERE seller_id = ?1
    )
    SELECT kind, CAST(sum(total_minor) AS TEXT) AS totalMinor, count(*) AS orderCount,
      min(completed_at) AS firstCompletedAt, max(completed_at) AS latestCompletedAt
    FROM entries
    WHERE EXISTS (SELECT 1 FROM subscriber WHERE id = ?1 AND state = 'active')
    GROUP BY kind ORDER BY kind
  `).bind(actor.subscriberId).all();
}

// visibleFrom is computed by the caller once an invoice visibility policy is
// approved. Cumulative totals are intentionally independent of this filter.
export async function listInvoices(database, actor, { visibleFrom, limit = 20, after = null }) {
  if (!Number.isSafeInteger(visibleFrom) || visibleFrom < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50
    || (after !== null && (!Number.isSafeInteger(after.completedAt) || typeof after.invoiceId !== "string"))) {
    throw new TypeError("invalid invoice query");
  }
  const { results } = await database.prepare(`
    SELECT invoice.id AS invoiceId, total.order_id AS orderId, total.completed_at AS completedAt,
      CAST(total.total_minor AS TEXT) AS totalMinor, total.currency,
      CASE WHEN total.buyer_id = ?1 THEN 'purchase' ELSE 'sale' END AS kind
    FROM completed_order_total AS total JOIN order_invoice AS invoice ON invoice.order_id = total.order_id
    WHERE (total.buyer_id = ?1 OR total.seller_id = ?1) AND total.completed_at >= ?2
      AND EXISTS (SELECT 1 FROM subscriber WHERE id = ?1 AND state = 'active')
      AND (?3 IS NULL OR (total.completed_at, invoice.id) < (?3, ?4))
    ORDER BY total.completed_at DESC, invoice.id DESC LIMIT ?5
  `).bind(actor.subscriberId, visibleFrom, after?.completedAt ?? null, after?.invoiceId ?? null, limit + 1).all();
  const invoices = results.slice(0, limit);
  const last = invoices.at(-1);
  return { invoices, next: results.length > limit ? { completedAt: last.completedAt, invoiceId: last.invoiceId } : null };
}
