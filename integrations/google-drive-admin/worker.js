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

    if (
      request.method !== "GET" &&
      !(request.method === "POST" &&
        (url.pathname === "/drive/catalog/setup" ||
         url.pathname === "/drive/catalog/upload-test"))
    ) {
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

    if (url.pathname === "/drive/catalog/setup" && request.method === "POST") {
      const origin = request.headers.get("Origin");
      const expectedOrigin = new URL(request.url).origin;

      if (origin !== expectedOrigin) {
        return json({ error: "Forbidden origin" }, 403);
      }

      if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) {
        return json({ error: "JSON required" }, 415);
      }

      try {
        const existing = await env.SAFAQAT_DRIVE_AUTH.get("google:catalog-folder");
        if (existing) {
          return json({ ready: true, folderId: existing, created: false });
        }

        const accessToken = await getDriveAccessToken(env);
        const email = await verifyDriveConnection(accessToken);

        if (email?.toLowerCase() !== EXPECTED_EMAIL) {
          return json({ error: "Unauthorized Google account" }, 403);
        }

        const response = await fetch(
          "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType",
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              name: "SAFAQAT-CATALOG",
              mimeType: "application/vnd.google-apps.folder"
            })
          }
        );

        if (!response.ok) {
          return json({ error: "Google Drive folder creation failed" }, 502);
        }

        const folder = await response.json();
        if (!folder.id) {
          return json({ error: "Google Drive returned no folder ID" }, 502);
        }

        await env.SAFAQAT_DRIVE_AUTH.put(
          "google:catalog-folder",
          folder.id
        );

        return json({
          ready: true,
          created: true,
          folderId: folder.id,
          name: folder.name
        });
      } catch {
        return json({ error: "Catalog setup failed" }, 503);
      }
    }


    if (url.pathname === "/drive/catalog") {
      return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAFAQAT Drive Administration</title>
<style>
body{font-family:system-ui;max-width:680px;margin:60px auto;padding:20px;background:#101827;color:white}
button{padding:14px 20px;background:#f59e0b;border:0;border-radius:8px;font-weight:bold;cursor:pointer}
pre{white-space:pre-wrap;background:#1e293b;padding:20px;border-radius:8px}
</style>
</head>
<body>
<h1>SAFAQAT Drive Administration</h1>
<p>Create the cloud product catalog folder.</p>
<button id="setup">Create / Verify Catalog</button>
<button id="upload">Upload Test Image</button>
<pre id="result">Ready</pre>
<script>
document.getElementById("upload").onclick=async()=>{
 const result=document.getElementById("result");
 result.textContent="Uploading...";
 try{
  const r=await fetch("/drive/catalog/upload-test",{
   method:"POST",
   headers:{"Content-Type":"application/json"}
  });
  result.textContent=JSON.stringify(await r.json(),null,2);
 }catch(e){result.textContent="Upload request failed";}
};
document.getElementById("setup").onclick=async()=>{
 const result=document.getElementById("result");
 result.textContent="Working...";
 try{
  const r=await fetch("/drive/catalog/setup",{
   method:"POST",
   headers:{"Content-Type":"application/json"}
  });
  result.textContent=JSON.stringify(await r.json(),null,2);
 }catch(e){result.textContent="Request failed";}
};
</script>
</body>
</html>`, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
        }
      });
    }


    if (url.pathname === "/drive/catalog/upload-test" && request.method === "POST") {
      const origin = request.headers.get("Origin");
      if (origin !== url.origin ||
          !(request.headers.get("Content-Type") || "").startsWith("application/json")) {
        return json({ error: "Forbidden request" }, 403);
      }

      try {
        const folderId = await env.SAFAQAT_DRIVE_AUTH.get("google:catalog-folder");
        if (!folderId) return json({ error: "Create catalog first" }, 409);

        const token = await getDriveAccessToken(env);
        const email = await verifyDriveConnection(token);
        if (email?.toLowerCase() !== EXPECTED_EMAIL) {
          return json({ error: "Unauthorized account" }, 403);
        }

        const png = Uint8Array.from(
          atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII="),
          c => c.charCodeAt(0)
        );

        const boundary = "safaqat_test_boundary";
        const metadata = {
          name: "SAFAQAT-CATALOG-TEST.png",
          mimeType: "image/png",
          parents: [folderId]
        };

        const body = new Blob([
          "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
          JSON.stringify(metadata),
          "\r\n--" + boundary + "\r\nContent-Type: image/png\r\n\r\n",
          png,
          "\r\n--" + boundary + "--\r\n"
        ]);

        const response = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents",
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": `multipart/related; boundary=${boundary}`
            },
            body
          }
        );

        if (!response.ok) {
          return json({ error: "Test image upload failed", status: response.status }, 502);
        }

        return json({ uploaded: true, file: await response.json() });
      } catch {
        return json({ error: "Upload test unavailable" }, 503);
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
