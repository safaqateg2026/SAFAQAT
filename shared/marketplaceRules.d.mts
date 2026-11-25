export type VehicleType =
  "rider" | "car" | "truck" | "bicycle";

export type PaymentMethod =
  "cash" | "wallet" | "instapay" | "fawry";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type NearbyEntry = {
  id: string;
  location: Coordinates;
};

export type VehicleEntry = NearbyEntry & {
  vehicleType: VehicleType;
  available: boolean;
};

export type DistanceResult<T> = T & {
  distanceMeters: number;
  distanceKind: "approximate";
};

export const VEHICLE_TYPES: readonly VehicleType[];
export const PAYMENT_METHODS: readonly PaymentMethod[];
export const DELIVERY_REQUEST_ROLES: readonly string[];

export function validCoordinates(point: unknown): boolean;

export function approximateDistanceMeters(
  from: Coordinates,
  to: Coordinates
): number | null;

export function sortNearby<T extends NearbyEntry>(
  origin: Coordinates,
  entries: T[]
): DistanceResult<T>[];

export function nearbyVehicles<T extends VehicleEntry>(
  origin: Coordinates,
  vehicles: T[],
  vehicleType: VehicleType
): DistanceResult<T>[];

export function validPaymentMethods(methods: unknown): boolean;

export function acceptsPayment(
  methods: unknown,
  selected: string
): boolean;

export function canRequestDelivery(role: string): boolean;
