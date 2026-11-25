export function buildConsumerRegistration(
  form,
  language,
  policyVersions
) {
  const read = name => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };

  const latitude = read("latitude");
  const longitude = read("longitude");

  if (!latitude || !longitude) return null;

  const input = {
    role: "consumer",
    fullName: read("fullName"),
    phone: read("phone"),
    email: read("email") || undefined,
    birthDate: read("consumerBirthDate"),
    governorateCode: read("governorateCode"),
    districtCode: read("districtCode"),
    address: read("address"),
    latitude: Number(latitude),
    longitude: Number(longitude),
    language,
    policyVersions
  };

  if (
    !input.fullName ||
    !/^\+201[0-9]{9}$/.test(input.phone) ||
    !input.birthDate ||
    !input.governorateCode ||
    !input.districtCode ||
    !input.address ||
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude) ||
    Math.abs(input.latitude) > 90 ||
    Math.abs(input.longitude) > 180 ||
    !["ar", "en"].includes(language) ||
    !policyVersions ||
    !["terms", "privacy", "commission",
      "sales_purchase", "delivery"].every(key =>
        typeof policyVersions[key] === "string" &&
        policyVersions[key].trim().length > 0
      )
  ) return null;

  return input;
}
