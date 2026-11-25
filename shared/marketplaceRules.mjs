export const VEHICLE_TYPES = Object.freeze([
  "rider",
  "car",
  "truck",
  "bicycle"
]);

export const PAYMENT_METHODS = Object.freeze([
  "cash",
  "wallet",
  "instapay",
  "fawry"
]);

export const DELIVERY_REQUEST_ROLES = Object.freeze([
  "supplier",
  "retailer",
  "consumer"
]);

export function validCoordinates(point) {
  return Boolean(
    point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export function approximateDistanceMeters(from, to) {
  if (!validCoordinates(from) || !validCoordinates(to)) {
    return null;
  }

  const radians = value => value * Math.PI / 180;

  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  return Math.round(
    6371008.8 * 2 *
    Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))))
  );
}

export function sortNearby(origin, entries) {
  if (!validCoordinates(origin) || !Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter(entry =>
      entry &&
      typeof entry.id === "string" &&
      validCoordinates(entry.location)
    )
    .map(entry => ({
      ...entry,
      distanceMeters: approximateDistanceMeters(
        origin,
        entry.location
      ),
      distanceKind: "approximate"
    }))
    .sort((a, b) =>
      a.distanceMeters - b.distanceMeters ||
      a.id.localeCompare(b.id)
    );
}

export function nearbyVehicles(origin, vehicles, vehicleType) {
  if (
    !VEHICLE_TYPES.includes(vehicleType) ||
    !Array.isArray(vehicles)
  ) return [];

  return sortNearby(
    origin,
    vehicles.filter(vehicle =>
      vehicle &&
      vehicle.available === true &&
      vehicle.vehicleType === vehicleType
    )
  );
}

export function validPaymentMethods(methods) {
  return Array.isArray(methods) &&
    methods.length > 0 &&
    methods.length <= PAYMENT_METHODS.length &&
    new Set(methods).size === methods.length &&
    methods.every(method => PAYMENT_METHODS.includes(method));
}

export function acceptsPayment(methods, selected) {
  return validPaymentMethods(methods) &&
    methods.includes(selected);
}

export function canRequestDelivery(role) {
  return DELIVERY_REQUEST_ROLES.includes(role);
}
