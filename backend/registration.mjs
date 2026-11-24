// Server-side preflight. The caller supplies the approved catalogs for the
// selected environment and persists the validated registration atomically.
const roles = new Set(["supplier", "retailer", "consumer", "courier"]);
const vehicles = new Set(["rider", "car", "truck"]);

export function requiredPolicies(role) {
  if (!roles.has(role)) throw new TypeError("invalid registration role");
  const policies = ["terms", "privacy", "commission"];
  if (role !== "courier") policies.push("sales_purchase");
  if (role === "courier" || role === "consumer") policies.push("delivery");
  return policies;
}

export function validateRegistration(input, { today, districts, activities, policyVersions }) {
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
  if (!emailProvided && role !== "consumer") issues.push("emailRequired");
  if (emailProvided && (typeof input.email !== "string" || input.email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) issues.push("invalidEmail");

  const birth = input.birthDate;
  const parsedBirth = typeof birth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? new Date(birth) : null;
  if (!parsedBirth || !Number.isFinite(parsedBirth.valueOf())
    || parsedBirth.toISOString().slice(0, 10) !== birth || birth > today) {
    issues.push("invalidBirthDate");
  } else {
    const adulthoodYear = Number(birth.slice(0, 4)) + 18;
    if (`${adulthoodYear}${birth.slice(4)}` > today) issues.push("minimumAge");
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
    if (!activities.has(input.business?.activityCode)) issues.push("invalidBusinessActivity");
  }
  if (role === "courier" && !vehicles.has(input.delivery?.vehicleType)) issues.push("invalidVehicle");

  if (requiredPolicies(role).some(policy => {
    const version = policyVersions.get(policy);
    return !version || input.policyVersions?.[policy] !== version;
  })) issues.push("policiesRequired");
  return issues;
}
