import {
  createPendingRegistration,
  cancelPendingRegistration,
  readPendingRegistration
} from "./pendingRegistration.mjs";

import {
  writePendingRegistrationCookie,
  readPendingRegistrationCookie,
  clearPendingRegistrationCookie
} from "./pendingRegistrationCookie.mjs";

import {
  createWhatsAppLink
} from "./providers/whatsapp.mjs";

import {
  readBoundedBody
} from "./providers/webhookSecurity.mjs";

import {
  reserveAuthAttempt
} from "./authRateLimit.mjs";

function response(status, body, cookie) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'"
  });

  if (cookie) headers.set("Set-Cookie", cookie);

  return Response.json(body, { status, headers });
}

async function readInput(request) {
  const type = request.headers.get("Content-Type") || "";

  if (type.split(";")[0].trim().toLowerCase()
      !== "application/json") return null;

  const body = await readBoundedBody(request, 2048);

  if (!body) return null;

  try {
    const value = JSON.parse(
      new TextDecoder("utf-8", {
        fatal: true
      }).decode(body)
    );

    if (!value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length !== 1 ||
        typeof value.phone !== "string" ||
        !/^\+201[0-9]{9}$/.test(value.phone)) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

async function rateDigest(key, subject) {
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(JSON.stringify([
      "registration-http-rate-v1",
      subject
    ]))
  );

  return Array.from(
    new Uint8Array(bytes),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

export function createPendingRegistrationApi({
  database,
  key,
  origin,
  businessPhone,
  trustedRateSubject,
  clock = () => Math.floor(Date.now() / 1000)
}) {
  if (!database ||
      !key ||
      typeof trustedRateSubject !== "function" ||
      !/^201[0-9]{9}$/.test(businessPhone) ||
      new URL(origin).origin !== origin ||
      !origin.startsWith("https://")) {
    throw new TypeError("trusted registration configuration required");
  }

  return async function handle(request) {
    try {
      const url = new URL(request.url);

      if (url.origin !== origin ||
          request.headers.get("Origin") !== origin) {
        return response(403, {
          error: "origin_denied"
        });
      }

      if (request.method !== "POST") {
        return response(405, {
          error: "method_not_allowed"
        });
      }

      if (url.search) {
        return response(400, {
          error: "invalid_request"
        });
      }

      const now = clock();
      const subject = await trustedRateSubject(request);

      if (typeof subject !== "string" ||
          subject.length < 1 ||
          subject.length > 256 ||
          !Number.isSafeInteger(now) ||
          now < 0) {
        return response(503, {
          error: "service_unavailable"
        });
      }

      if (url.pathname === "/api/registration/cancel") {
        const binding = readPendingRegistrationCookie(
          request.headers.get("Cookie")
        );

        if (binding) {
          await cancelPendingRegistration(
            database, key, binding
          );
        }

        return response(
          200,
          { cancelled: true },
          clearPendingRegistrationCookie()
        );
      }

      if (![
        "/api/registration/start",
        "/api/registration/status"
      ].includes(url.pathname)) {
        return response(404, {
          error: "not_found"
        });
      }

      const allowed = await reserveAuthAttempt(
        database, {
          action: "challenge_issue",
          subjectDigest: await rateDigest(
            key, [url.pathname, subject]
          ),
          now,
          windowSeconds: 60,
          limit: 60
        }
      );

      if (!allowed) {
        return response(429, {
          error: "rate_limited"
        });
      }

      const input = await readInput(request);

      if (!input) {
        return response(400, {
          error: "invalid_request"
        });
      }

      if (url.pathname === "/api/registration/start") {
        const pending = await createPendingRegistration(
          database,
          key,
          {
            phone: input.phone,
            rateSubject: subject,
            now,
            expiresAt: now + 900
          }
        );

        if (!pending) {
          return response(429, {
            error: "rate_limited"
          });
        }

        const whatsappUrl = createWhatsAppLink({
          businessPhone,
          id: pending.id,
          proof: pending.proof,
          purpose: "registration"
        });

        return response(
          200,
          {
            whatsappUrl: String(whatsappUrl),
            expiresAt: pending.expiresAt,
            verified: false
          },
          writePendingRegistrationCookie(
            pending, now
          )
        );
      }

      const binding = readPendingRegistrationCookie(
        request.headers.get("Cookie")
      );

      if (!binding) {
        return response(401, {
          error: "registration_required"
        });
      }

      const status = await readPendingRegistration(
        database,
        key,
        {
          ...binding,
          phone: input.phone
        },
        now
      );

      if (!status) {
        return response(401, {
          error: "registration_required"
        });
      }

      return response(200, status);

    } catch {
      return response(503, {
        error: "service_unavailable"
      });
    }
  };
}
