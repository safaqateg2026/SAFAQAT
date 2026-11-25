/** Stable field IDs for a future trusted document extraction service. No OCR runs in this UI. */
export const verificationOcrFieldMap = {
  nationalIdentity: {
    fullName: "nationalIdentity.fullName",
    identityNumber: "nationalIdentity.identityNumber",
    dateOfBirth: "nationalIdentity.dateOfBirth",
    registeredAddress: "nationalIdentity.registeredAddress",
    expirationDate: "nationalIdentity.expirationDate",
  },
  drivingLicense: {
    holderName: "drivingLicense.holderName",
    licenseNumber: "drivingLicense.licenseNumber",
    category: "drivingLicense.category",
    expirationDate: "drivingLicense.expirationDate",
  },
  vehicleLicense: {
    ownerName: "vehicleLicense.ownerName",
    plateLetters: "vehicleLicense.plateLetters",
    plateDigits: "vehicleLicense.plateDigits",
    vehicleType: "vehicleLicense.vehicleType",
    manufacturer: "vehicleLicense.manufacturer",
    model: "vehicleLicense.model",
    color: "vehicleLicense.color",
    chassisNumber: "vehicleLicense.chassisNumber",
    engineNumber: "vehicleLicense.engineNumber",
    expirationDate: "vehicleLicense.expirationDate",
  },
} as const;

export type TrustedVehicleLicenseFields = {
  plateLetters?: string;
  plateDigits?: string;
};

/** Maps already trusted vehicle-license fields to the read-only plate display. */
export function mapTrustedVehiclePlate(fields?: TrustedVehicleLicenseFields) {
  return {
    letters: fields?.plateLetters ?? "",
    digits: fields?.plateDigits ?? "",
  };
}
