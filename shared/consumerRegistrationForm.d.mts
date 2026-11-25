import type { RegistrationInput } from "./registrationClient.mjs";

export function buildConsumerRegistration(
  form: FormData,
  language: "ar" | "en",
  policyVersions: Record<string, string>
): RegistrationInput | null;
