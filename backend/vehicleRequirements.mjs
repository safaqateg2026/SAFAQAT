const vehicles = new Set(["rider", "car", "truck", "bicycle"]);
export function vehicleRequirements(vehicle, ownership = "unknown") {
  if (!vehicles.has(vehicle)) throw new TypeError("invalid vehicle type");
  if (vehicle === "bicycle") return { drivingLicense: false, vehicleLicense: false, vehiclePhoto: true, plateVisible: false, review: false };
  if (vehicle === "rider") return { drivingLicense: false, vehicleLicense: false, vehiclePhoto: true, plateVisible: true, review: false };
  if (ownership === "verified_owner") return { drivingLicense: true, vehicleLicense: true, vehiclePhoto: false, plateVisible: false, review: false };
  if (ownership === "not_owner") return { drivingLicense: true, vehicleLicense: true, vehiclePhoto: true, plateVisible: true, review: false };
  return { drivingLicense: true, vehicleLicense: true, vehiclePhoto: false, plateVisible: false, review: true };
}
