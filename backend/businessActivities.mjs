import catalog from "../shared/businessActivities.json" with { type: "json" };

export function createApprovedActivities() {
  return new Set(
    Object.values(catalog).flat().map(item => item.id)
  );
}

export function isApprovedBusinessActivity(role, id) {
  return Object.hasOwn(catalog, role) &&
    catalog[role].some(item => item.id === id);
}
