import { searchSubscribers } from "./administration.mjs";
import { readSubscriberDossier } from "./subscriberDossier.mjs";
import { readSubscriberHistory } from "./subscriberHistory.mjs";

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;

const sections = new Set([
  "orders", "invoices", "activity",
  "reviews", "support", "archive"
]);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'"
    }
  });
}

export function createAdminApi({
  database,
  authenticateAdministrator,
  clock = () => Math.floor(Date.now() / 1000),
  invoiceVisibleFrom
}) {
  if (!database ||
      typeof authenticateAdministrator !== "function") {
    throw new TypeError("trusted authentication required");
  }

  return async function handleAdminRequest(request) {
    try {
      const url = new URL(request.url);

      if (url.protocol !== "https:") {
        return json(403, { error: "secure_transport_required" });
      }

      const actor = await authenticateAdministrator(request);

      if (!actor ||
          !idPattern.test(actor.administratorId ?? "") ||
          actor.mfaVerified !== true) {
        return json(401, { error: "authentication_required" });
      }

      if (request.method !== "GET") {
        return json(405, { error: "method_not_allowed" });
      }

      const origin = request.headers.get("Origin");

      if (origin && origin !== url.origin) {
        return json(403, { error: "origin_denied" });
      }

      const now = clock();

      if (!Number.isSafeInteger(now) || now < 0) {
        return json(503, { error: "service_unavailable" });
      }

      const params = url.searchParams;

      if ([...new Set(params.keys())].some(
        key => params.getAll(key).length !== 1
      )) {
        return json(400, { error: "invalid_query" });
      }

      const rawLimit = params.get("limit") ?? "20";

      if (!/^[0-9]{1,2}$/.test(rawLimit)) {
        return json(400, { error: "invalid_page" });
      }

      const limit = Number(rawLimit);
      const after = params.get("after") ?? "";

      if (limit < 1 || limit > 50 ||
          (after !== "" && !idPattern.test(after))) {
        return json(400, { error: "invalid_page" });
      }

      if (url.pathname === "/api/admin/subscribers") {
        const result = await searchSubscribers(
          database, actor,
          {
            role: params.get("role"),
            text: params.get("q") ?? "",
            after,
            limit
          },
          { now }
        );

        return json(200, result);
      }

      const match = url.pathname.match(
        /^\/api\/admin\/subscribers\/([A-Za-z0-9_-]{1,128})(?:\/([a-z]+))?$/
      );

      if (!match) {
        return json(404, { error: "not_found" });
      }

      const [, subscriberId, section] = match;

      if (!section) {
        const result = await readSubscriberDossier(
          database, actor, subscriberId, { now }
        );

        return result
          ? json(200, result)
          : json(404, { error: "not_found" });
      }

      if (!sections.has(section)) {
        return json(404, { error: "not_found" });
      }

      const result = await readSubscriberHistory(
        database, actor, subscriberId,
        {
          section,
          now,
          after,
          limit,
          invoiceVisibleFrom: section === "invoices"
            ? invoiceVisibleFrom?.(now)
            : undefined
        }
      );

      return json(200, result);

    } catch (error) {
      if (error?.message === "administrator access denied") {
        return json(403, { error: "access_denied" });
      }

      if (error instanceof TypeError) {
        return json(400, { error: "invalid_request" });
      }

      return json(503, { error: "service_unavailable" });
    }
  };
}
