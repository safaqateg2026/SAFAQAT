import {
  isEligibleBirthDate,
  validatePlate
} from "../shared/registrationRules.mjs";

import {
  prepareVerifiedRegistrationClaim,
  readPendingRegistration
} from "./pendingRegistration.mjs";

// Server-side preflight. The caller supplies the approved catalogs for the
// selected environment and persists the validated registration atomically.
const roles = new Set(["supplier", "retailer", "consumer", "courier"]);
const vehicles = new Set(["rider", "car", "truck", "bicycle"]);
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

export function normalizePlateDigits(value) {
  return value.replace(/[٠-٩۰-۹]/g, digit => {
    const index = arabicDigits.indexOf(digit);
    return String(index >= 0 ? index : persianDigits.indexOf(digit));
  }).replace(/\D/g, "");
}

export function normalizePlateLetters(value) {
  return value.replace(/[^ء-يٱ-ۓ]/g, "").normalize("NFC");
}

export function requiredPolicies(role) {
  if (!roles.has(role)) throw new TypeError("invalid registration role");
  const policies = ["terms", "privacy", "commission"];
  if (role !== "courier") policies.push("sales_purchase");
  if (role === "courier" || role === "consumer") policies.push("delivery");
  return policies;
}

export function validateRegistration(input, { today, districts, activities, policyVersions, isApprovedBusinessActivity }) {
  const issues = [];
  const role = input?.role;
  if (!roles.has(role)) return ["invalidRole"];

  function requireText(value, issue) {
    if (typeof value !== "string" || !value.trim()) issues.push(issue);
  }

  requireText(input.fullName, "nameRequired");
  if (typeof input.phone !== "string" || !/^\+201[0-9]{9}$/.test(input.phone)) {
    issues.push("invalidPhone");
  }
  const emailProvided = input.email !== undefined && input.email !== null && input.email !== "";

  if (emailProvided && (typeof input.email !== "string" || input.email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) issues.push("invalidEmail");

  const birth = input.birthDate;
  const parsedBirth = typeof birth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? new Date(birth) : null;
  if (!parsedBirth || !Number.isFinite(parsedBirth.valueOf())
    || parsedBirth.toISOString().slice(0, 10) !== birth || birth.startsWith("0000-") || birth > today) {
    issues.push("invalidBirthDate");
  }

  if (!issues.includes("invalidBirthDate") &&
      !isEligibleBirthDate(
        role,
        ...birth.split("-").map(Number),
        today
      )) {
    issues.push("invalidBirthDate");
  }

  if (!districts.get(input.governorateCode)?.has(input.districtCode)) issues.push("invalidDistrict");
  requireText(input.address, "addressRequired");
  if (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90
    || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) {
    issues.push("invalidLocation");
  }

  if (role === "supplier" || role === "retailer") {
    requireText(input.business?.name, "businessNameRequired");
    requireText(input.business?.premisesAddress, "premisesAddressRequired");
    if (!activities.has(input.business?.activityCode) ||
      (isApprovedBusinessActivity &&
       !isApprovedBusinessActivity(role, input.business?.activityCode))) {
      issues.push("invalidBusinessActivity");
    }
  }
  if (role === "courier") {
    if (!vehicles.has(input.delivery?.vehicleType)) issues.push("invalidVehicle");
    const letters = input.delivery?.plateLetters ?? "";
    const digits = input.delivery?.plateDigits ?? "";
    if (typeof letters !== "string" || typeof digits !== "string"
      || (letters && !/^[ء-يٱ-ۓ ]{1,6}$/.test(letters))
      || (digits && !/^[0-9٠-٩۰-۹ ]{1,8}$/.test(digits))
      || (input.delivery?.vehicleType === "bicycle" && (letters || digits))) issues.push("invalidPlate");
  }

  if (requiredPolicies(role).some(policy => {
    const version = policyVersions.get(policy);
    return !version || input.policyVersions?.[policy] !== version;
  })) issues.push("policiesRequired");
  return issues;
}

// The trusted caller supplies the current catalogs and policy versions.
// Document uploads and contact delivery are separate, authorized operations.
async function persistRegistration(
  database, input, catalogs, now, verification = null
) {
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("invalid registration timestamp");

  const issues = validateRegistration(input, catalogs);
  if (issues.length) return { issues };

  const id = crypto.randomUUID();
  const statements = [
    database.prepare(`
      INSERT INTO subscriber
        (id, role, phone, email, full_name, birth_date, governorate_code,
         district_code, address, latitude, longitude, language, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    `).bind(id, input.role, input.phone, input.email || null, input.fullName.trim(),
      input.birthDate, input.governorateCode, input.districtCode, input.address.trim(),
      input.latitude, input.longitude, input.language === "en" ? "en" : "ar", now),
  ];
  if (input.role === "supplier" || input.role === "retailer") {
    statements.push(database.prepare(`
      INSERT INTO subscriber_business (subscriber_id, name, activity_code, premises_address)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(id, input.business.name.trim(), input.business.activityCode, input.business.premisesAddress.trim()));
  }
  if (input.role === "courier") {
    const letters = normalizePlateLetters(input.delivery.plateLetters ?? "");
    const digits = normalizePlateDigits(input.delivery.plateDigits ?? "");
    const legacy = input.delivery.plateNumber ?? ([letters, digits].filter(Boolean).join(" ") || null);
    statements.push(database.prepare(`
      INSERT INTO subscriber_delivery
        (subscriber_id, vehicle_type, plate_number, plate_letters, plate_digits)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `).bind(id, input.delivery.vehicleType, legacy, letters || null, digits || null));
  }
  if (input.role === "retailer") {
    statements.push(database.prepare(`
      INSERT INTO retailer_directory_identity (retailer_id, search_code) VALUES (?1, ?2)
    `).bind(id, id));
  }
  for (const policy of requiredPolicies(input.role)) {
    statements.push(database.prepare(`
      INSERT INTO subscriber_policy_acceptance (subscriber_id, policy, version, accepted_at)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(id, policy, catalogs.policyVersions.get(policy), now));
  }
  statements.push(database.prepare(`
    INSERT INTO subscriber_audit_event (id, subscriber_id, actor_type, actor_id, event_type, occurred_at)
    VALUES (?1, ?2, 'subscriber', ?3, 'registered', ?4)
  `).bind(crypto.randomUUID(), id, id, now));
  if (verification) {
    statements.push(
      await prepareVerifiedRegistrationClaim(
        database,
        verification.key,
        {
          id: verification.binding.id,
          browserSecret: verification.binding.browserSecret,
          phone: input.phone,
          subscriberId: id
        },
        now
      )
    );
  }

  await database.batch(statements);
  return { subscriberId: id };
}


// Internal compatibility path. Never expose directly to public clients.
export async function saveRegistration(
  database, input, catalogs, now
) {
  return persistRegistration(
    database, input, catalogs, now
  );
}

// Public registration must use this verified path.
export async function saveVerifiedRegistration(
  database, key, binding, input, catalogs, now
) {
  const issues = validateRegistration(input, catalogs);

  if (input?.role === "courier") {
    const delivery = input.delivery;

    if (!validatePlate(
      delivery?.plateLetters ?? "",
      delivery?.plateDigits ?? "",
      delivery?.vehicleType
    ) || (
      delivery?.plateNumber !== undefined &&
      delivery?.plateNumber !== null &&
      delivery?.plateNumber !== ""
    )) {
      if (!issues.includes("invalidPlate")) {
        issues.push("invalidPlate");
      }
    }
  }

  if (issues.length) return { issues };

  if (!binding) {
    return { issues: ["phoneVerificationRequired"] };
  }

  const status = await readPendingRegistration(
    database, key,
    {
      id: binding.id,
      browserSecret: binding.browserSecret,
      phone: input.phone
    },
    now
  );

  if (!status?.verified) {
    return { issues: ["phoneVerificationRequired"] };
  }

  return persistRegistration(
    database, input, catalogs, now,
    { key, binding }
  );
}
