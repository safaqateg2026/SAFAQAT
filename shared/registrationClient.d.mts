export type RegistrationInput = {
  role: "consumer" | "supplier" | "retailer" | "courier";
  fullName: string;
  phone: string;
  email?: string;
  birthDate: string;
  governorateCode: string;
  districtCode: string;
  address: string;
  latitude: number;
  longitude: number;
  language?: "ar" | "en";
  business?: {
    name: string;
    premisesAddress: string;
    activityCode: string;
  };
  delivery?: {
    vehicleType: "truck" | "car" | "rider" | "bicycle";
    plateLetters?: string;
    plateDigits?: string;
  };
  policyVersions: Record<string, string>;
};

export type RegistrationResult = {
  saved: boolean;
  activated: false;
  error?: string;
};

export function submitRegistration(
  input: RegistrationInput,
  options?: {
    enabled?: boolean;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  }
): Promise<RegistrationResult>;
