export type VehicleKind = "rider" | "car" | "truck" | "bicycle";
export type Ownership = "verified_owner" | "not_owner" | "unknown";

export function vehicleVerificationRequirements(vehicle: VehicleKind, ownership: Ownership) {
  if (vehicle === "bicycle") return { drivingLicense: false, vehicleLicense: false, vehiclePhoto: true, plateVisible: false, review: false };
  if (vehicle === "rider") return { drivingLicense: false, vehicleLicense: false, vehiclePhoto: true, plateVisible: true, review: false };
  if (ownership === "verified_owner") return { drivingLicense: true, vehicleLicense: true, vehiclePhoto: false, plateVisible: false, review: false };
  if (ownership === "not_owner") return { drivingLicense: true, vehicleLicense: true, vehiclePhoto: true, plateVisible: true, review: false };
  return { drivingLicense: true, vehicleLicense: true, vehiclePhoto: false, plateVisible: false, review: true };
}
