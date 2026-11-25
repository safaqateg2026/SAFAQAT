import { saveVerifiedRegistration } from "./registration.mjs";
import { readBoundedBody } from "./providers/webhookSecurity.mjs";
import { readPendingRegistrationCookie } from "./pendingRegistrationCookie.mjs";

function object(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function keys(value, allowed) {
  return object(value) &&
    Object.keys(value).every(key => allowed.includes(key));
}

function text(value, max) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max;
}

export function validCompletionInput(input) {
  if (!keys(input, [
    "role", "fullName", "phone", "email",
    "birthDate", "governorateCode", "districtCode",
    "address", "latitude", "longitude",
    "business", "delivery", "policyVersions"
  ])) return false;

  if (!["consumer", "retailer", "supplier", "courier"]
      .includes(input.role)) return false;

  if (!text(input.fullName, 150) ||
      !/^\+201[0-9]{9}$/.test(input.phone ?? "") ||
      !text(input.birthDate, 10) ||
      !text(input.governorateCode, 100) ||
      !text(input.districtCode, 100) ||
      !text(input.address, 300) ||
      !Number.isFinite(input.latitude) ||
      !Number.isFinite(input.longitude)) return false;

  if (input.email != null && !text(input.email, 254)) {
    return false;
  }

  if (!keys(input.policyVersions, [
    "terms", "privacy", "commission",
    "sales_purchase", "delivery"
  ]) || !Object.values(input.policyVersions)
      .every(value => text(value, 100))) return false;

  const businessRole =
    input.role === "retailer" || input.role === "supplier";

  if (businessRole) {
    if (!keys(input.business, [
      "name", "premisesAddress", "activityCode"
    ]) ||
      !text(input.business.name, 150) ||
      !text(input.business.premisesAddress, 300) ||
      !text(input.business.activityCode, 100)) return false;
  } else if (input.business != null) {
    return false;
  }

  if (input.role === "courier") {
    if (!keys(input.delivery, [
      "vehicleType", "plateLetters", "plateDigits"
    ]) ||
      !["rider", "car", "truck", "bicycle"]
        .includes(input.delivery.vehicleType)) return false;

    for (const field of ["plateLetters", "plateDigits"]) {
      const value = input.delivery[field];
      if (value != null &&
          (typeof value !== "string" || value.length > 16)) {
        return false;
      }
    }
  } else if (input.delivery != null) {
    return false;
  }

  return true;
}

export async function completeRegistration({
  request, database, key, catalogs, now
}) {
  if (!catalogs ||
      !(catalogs.districts instanceof Map) ||
      !(catalogs.activities instanceof Set) ||
      !(catalogs.policyVersions instanceof Map) ||
      !catalogs.policyVersions.size) {
    return {
      status: 503,
      body: { error: "registration_disabled" }
    };
  }

  const binding = readPendingRegistrationCookie(
    request.headers.get("Cookie")
  );

  if (!binding) {
    return {
      status: 401,
      body: { error: "registration_required" }
    };
  }

  const type = request.headers.get("Content-Type") || "";

  if (type.split(";")[0].trim().toLowerCase()
      !== "application/json") {
    return {
      status: 400,
      body: { error: "invalid_request" }
    };
  }

  let input;

  try {
    const bytes = await readBoundedBody(request, 16384);

    if (!bytes) throw new Error("invalid_body");

    input = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    );
  } catch {
    return {
      status: 400,
      body: { error: "invalid_request" }
    };
  }

  if (!validCompletionInput(input)) {
    return {
      status: 400,
      body: { error: "invalid_request" }
    };
  }

  try {
    const result = await saveVerifiedRegistration(
      database, key, binding, input, catalogs, now
    );

    if (result.issues?.length) {
      return {
        status: 422,
        body: {
          error: "registration_not_completed",
          issues: result.issues
        }
      };
    }

    return {
      status: 201,
      body: {
        saved: true,
        activated: false
      },
      clearCookie: true
    };
  } catch {
    return {
      status: 409,
      body: { error: "registration_not_completed" }
    };
  }
}
