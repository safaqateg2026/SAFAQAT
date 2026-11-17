import { createGoogleAuthUrl } from "../google-drive-worker/oauth.js";
import { verifyOAuthState } from "../google-drive-worker/oauth-state.js";
// SAFAQAT Google Drive administration.
// OAuth routes remain disabled until Access protection is configured.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ service: "safaqat-drive-admin", status: "ok" });
    }

    if (url.pathname === "/oauth/start" && request.method === "GET") {
      try {
        const { url: authUrl, state } = await createGoogleAuthUrl(env);
        const nonce = state.split(".")[0];
        await env.SAFAQAT_DRIVE_AUTH.put(
          `oauth:${nonce}`,
          "pending",
          { expirationTtl: 300 }
        );
        const response = Response.redirect(authUrl, 302);
        response.headers.set(
          "Set-Cookie",
          `safaqat_oauth_state=${encodeURIComponent(state)}; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=300`
        );
        response.headers.set("Cache-Control", "no-store");
        return response;
      } catch {
        return json({ error: "OAuth configuration is incomplete" }, 503);
      }
    }

    if (url.pathname === "/oauth/callback" && request.method === "GET") {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/(?:^|;\s*)safaqat_oauth_state=([^;]+)/);
      const savedState = match ? decodeURIComponent(match[1]) : "";
      const returnedState = url.searchParams.get("state") || "";

      const valid = savedState &&
        savedState === returnedState &&
        await verifyOAuthState(returnedState, env.OAUTH_STATE_SECRET);

      const nonce = returnedState.split(".")[0];
      const pending = valid
        ? await env.SAFAQAT_DRIVE_AUTH.get(`oauth:${nonce}`)
        : null;

      if (pending === "pending") {
        await env.SAFAQAT_DRIVE_AUTH.delete(`oauth:${nonce}`);
      }

      const response = valid && pending === "pending"
        ? json({
            status: "validated",
            message: "OAuth state verified; token exchange not enabled yet"
          })
        : json({ error: "Invalid OAuth state" }, 403);

      response.headers.set(
        "Set-Cookie",
        "safaqat_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=0"
      );
      return response;
    }

    return json({ error: "Administration is not enabled" }, 403);
  },
};
