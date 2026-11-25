import { findActiveSession } from "./sessions.mjs";
import { readSessionCookie } from "./sessionCookie.mjs";

import {
  readPrivateDeliveryRoute,
  readOwnDeliveryHistory
} from "./deliveryAccess.mjs";

function json(status, body) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'"
    }
  });
}

export function createDeliveryApi({
  database,
  origin,
  clock = () => Math.floor(Date.now() / 1000)
}) {
  const allowed = new URL(origin);

  if (
    allowed.protocol !== "https:" ||
    allowed.origin !== origin
  ) {
    throw new TypeError("Invalid delivery API origin");
  }

  return async function deliveryApi(request) {
    try {
      const url = new URL(request.url);
      const requestOrigin = request.headers.get("Origin");

      if (
        url.origin !== origin ||
        (requestOrigin && requestOrigin !== origin)
      ) {
        return json(403, { error: "origin_denied" });
      }

      const history =
        url.pathname === "/api/delivery/history";

      const route = /^\/api\/delivery\/([A-Za-z0-9_-]{1,100})\/route$/
        .exec(url.pathname);

      if (!history && !route) {
        return json(404, { error: "not_found" });
      }

      if (request.method !== "GET") {
        return json(405, { error: "method_not_allowed" });
      }

      const cookie = request.headers.get("Cookie");

      if (!cookie || cookie.length > 8192) {
        return json(401, {
          error: "authentication_required"
        });
      }

      const token = readSessionCookie(cookie);
      const now = clock();

      if (!Number.isSafeInteger(now) || now < 0) {
        return json(503, { error: "service_unavailable" });
      }

      const session = await findActiveSession(
        database, token, now
      );

      if (!session) {
        return json(401, {
          error: "authentication_required"
        });
      }

      const actor = {
        id: session.subscriberId,
        role: session.role
      };

      if (history) {
        const keys = [...url.searchParams.keys()];

        if (
          keys.some(key => key !== "limit") ||
          keys.length > 1
        ) {
          return json(400, { error: "invalid_query" });
        }

        const rawLimit = url.searchParams.get("limit");
        const limit = rawLimit === null
          ? 20
          : Number(rawLimit);

        if (
          (rawLimit !== null &&
            !/^[0-9]{1,2}$/.test(rawLimit)) ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 50
        ) {
          return json(400, { error: "invalid_limit" });
        }

        return json(200, {
          requests: await readOwnDeliveryHistory(
            database, actor, limit
          )
        });
      }

      if (url.search) {
        return json(400, { error: "invalid_query" });
      }

      const result = await readPrivateDeliveryRoute(
        database, actor, route[1]
      );

      return result
        ? json(200, result)
        : json(404, { error: "not_found" });

    } catch {
      return json(503, { error: "service_unavailable" });
    }
  };
}
