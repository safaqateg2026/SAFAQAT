import { createGoogleAuthUrl } from "../google-drive-worker/oauth.js";
import { verifyOAuthState } from "../google-drive-worker/oauth-state.js";
import {
  exchangeAuthorizationCode,
  encryptRefreshToken,
  getDriveAccessToken,
  verifyDriveConnection
} from "./google-tokens.js";

const EXPECTED_EMAIL = "safaqat.eg2026@gmail.com";
const COOKIE_CLEAR =
  "safaqat_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=0";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function clearCookie(response) {
  response.headers.set("Set-Cookie", COOKIE_CLEAR);
  return response;
}

function readStateCookie(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)safaqat_oauth_state=([^;]+)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/health") {
      return json({
        service: "safaqat-drive-admin",
        status: "ok"
      });
    }

    if (url.pathname === "/oauth/start") {
      try {
        const { url: authUrl, state } = await createGoogleAuthUrl(env);
        const nonce = state.split(".")[0];

        await env.SAFAQAT_DRIVE_AUTH.put(
          `oauth:${nonce}`,
          "pending",
          { expirationTtl: 300 }
        );

        const response = new Response(null, {
          status: 302,
          headers: {
            Location: authUrl,
            "Cache-Control": "no-store"
          }
        });

        response.headers.set(
          "Set-Cookie",
          `safaqat_oauth_state=${encodeURIComponent(state)}; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=300`
        );

        return response;
      } catch {
        return json({ error: "OAuth initialization failed" }, 503);
      }
    }

    if (url.pathname === "/oauth/callback") {
      const returnedState = url.searchParams.get("state") || "";
      const savedState = readStateCookie(request);
      const code = url.searchParams.get("code");

      const valid = Boolean(
        savedState &&
        returnedState &&
        savedState === returnedState &&
        await verifyOAuthState(returnedState, env.OAUTH_STATE_SECRET)
      );

      if (!valid) {
        return clearCookie(json({ error: "Invalid OAuth state" }, 403));
      }

      const nonce = returnedState.split(".")[0];
      const pendingKey = `oauth:${nonce}`;
      const pending = await env.SAFAQAT_DRIVE_AUTH.get(pendingKey);

      if (pending !== "pending" || !code) {
        return clearCookie(json({
          error: "Authorization expired, missing or already processed"
        }, 403));
      }

      await env.SAFAQAT_DRIVE_AUTH.delete(pendingKey);

      try {
        const tokens = await exchangeAuthorizationCode(env, code);

        if (!tokens.refresh_token) {
          return clearCookie(json({
            error: "Google did not issue a refresh token"
          }, 409));
        }

        const email = await verifyDriveConnection(tokens.access_token);

        if (!email || email.toLowerCase() !== EXPECTED_EMAIL) {
          return clearCookie(json({
            error: "Unauthorized Google account"
          }, 403));
        }

        const encrypted = await encryptRefreshToken(
          env,
          tokens.refresh_token
        );

        await env.SAFAQAT_DRIVE_AUTH.put(
          "google:refresh-token",
          encrypted
        );

        return clearCookie(json({
          connected: true,
          account: email,
          storage: "encrypted",
          message: "Google Drive connected successfully"
        }));
      } catch {
        return clearCookie(json({
          error: "Google authorization or Drive verification failed"
        }, 502));
      }
    }

    if (url.pathname === "/drive/status") {
      try {
        const accessToken = await getDriveAccessToken(env);
        const email = await verifyDriveConnection(accessToken);

        if (!email || email.toLowerCase() !== EXPECTED_EMAIL) {
          return json({
            connected: false,
            error: "Google account mismatch"
          }, 403);
        }

        return json({
          connected: true,
          account: email,
          driveApi: "verified"
        });
      } catch {
        return json({
          connected: false,
          error: "Drive connection unavailable"
        }, 503);
      }
    }

    return json({ error: "Not found" }, 404);
  }
};
