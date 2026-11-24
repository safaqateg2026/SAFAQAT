import { readOwnArchiveDocument } from "./archive.mjs";
import { listInvoices, readInvoice } from "./invoices.mjs";
import { clearSessionCookie, readSessionCookie } from "./sessionCookie.mjs";
import { findActiveSession, revokeSession } from "./sessions.mjs";

function json(status, body, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

const notFound = () => json(404, { error: "not_found" });

function pageNumber(params, key, fallback, maximum) {
  const value = params.get(key);
  if (value === null) return fallback;
  if (!/^\d{1,16}$/.test(value) || Number(value) > maximum) return null;
  return Number(value);
}

// This handler has no deployment entry point. Supply a trusted, configured
// origin and invoice visibility policy when wiring an isolated environment.
export function createAccountApi({ database, privateBucket, origin, clock, invoiceVisibleFrom }) {
  const allowedOrigin = new URL(origin);
  if (allowedOrigin.protocol !== "https:" || origin !== allowedOrigin.origin) {
    throw new TypeError("account API requires a canonical HTTPS origin");
  }

  return async function accountApi(request) {
    const url = new URL(request.url);
    if (url.origin !== origin) return notFound();

    const path = url.pathname;
    const invoice = /^\/api\/account\/invoices\/([A-Za-z0-9_-]{1,128})$/.exec(path);
    const document = /^\/api\/account\/archive\/([A-Za-z0-9_-]{1,128})$/.exec(path);
    const logout = path === "/api/account/logout";
    if (!logout && !invoice && !document && !["/api/account/session", "/api/account/invoices"].includes(path)) {
      return notFound();
    }

    const method = logout ? "POST" : "GET";
    if (request.method !== method) return json(405, { error: "method_not_allowed" }, { Allow: method });
    if (logout && request.headers.get("Origin") !== origin) return json(403, { error: "origin_required" });

    const token = readSessionCookie(request.headers.get("Cookie"));
    const now = clock();
    const actor = await findActiveSession(database, token, now);
    if (!actor) return json(401, { error: "authentication_required" });

    if (logout) {
      await revokeSession(database, token, now);
      return new Response(null, { status: 204, headers: {
        "Cache-Control": "private, no-store", "Set-Cookie": clearSessionCookie(),
      } });
    }
    if (path === "/api/account/session") {
      return json(200, { role: actor.role, expiresAt: actor.expiresAt });
    }
    if (document) {
      if (!privateBucket) return notFound();
      return (await readOwnArchiveDocument(database, privateBucket, { token, documentId: document[1], clock })) ?? notFound();
    }

    const visibleFrom = invoiceVisibleFrom?.(now);
    if (!Number.isSafeInteger(visibleFrom) || visibleFrom < 0) return notFound();
    const limit = pageNumber(url.searchParams, "limit", invoice ? 50 : 20, invoice ? 100 : 50);
    if (!limit) return json(400, { error: "invalid_page" });
    if (invoice) {
      const afterLine = pageNumber(url.searchParams, "afterLine", 0, Number.MAX_SAFE_INTEGER);
      if (afterLine === null) return json(400, { error: "invalid_page" });
      const result = await readInvoice(database, actor, invoice[1], { visibleFrom, limit, afterLine });
      return result ? json(200, result) : notFound();
    }

    const completedAt = pageNumber(url.searchParams, "completedAt", undefined, Number.MAX_SAFE_INTEGER);
    const invoiceId = url.searchParams.get("invoiceId");
    if (completedAt === null || (completedAt === undefined) !== (invoiceId === null)
      || (invoiceId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(invoiceId))) {
      return json(400, { error: "invalid_page" });
    }
    const after = invoiceId === null ? null : { completedAt, invoiceId };
    return json(200, await listInvoices(database, actor, { visibleFrom, limit, after }));
  };
}
