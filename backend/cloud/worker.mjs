import { createAccountApi } from "../accountApi.mjs";

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

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (!env.APP_ORIGIN ||
          url.protocol !== "https:" ||
          url.origin !== env.APP_ORIGIN) {
        return json(403, { error: "origin_denied" });
      }

      const origin = request.headers.get("Origin");

      if (origin && origin !== env.APP_ORIGIN) {
        return json(403, { error: "origin_denied" });
      }

      if (url.pathname.startsWith("/api/admin/")) {
        return json(503, { error: "administration_disabled" });
      }

      if (url.pathname === "/api/health") {
        if (request.method !== "GET") {
          return json(405, { error: "method_not_allowed" });
        }

        return json(200, { status: "ok" });
      }

      if (!url.pathname.startsWith("/api/account/")) {
        return json(404, { error: "not_found" });
      }

      if (env.ACCOUNTS_ENABLED !== "true") {
        return json(503, { error: "accounts_disabled" });
      }

      if (!env.DB || !env.PRIVATE_BUCKET) {
        return json(503, { error: "service_unavailable" });
      }

      const handler = createAccountApi({
        database: env.DB,
        privateBucket: env.PRIVATE_BUCKET,
        origin: env.APP_ORIGIN,
        clock: () => Math.floor(Date.now() / 1000)
      });

      return await handler(request);

    } catch {
      return json(503, { error: "service_unavailable" });
    }
  }
};
