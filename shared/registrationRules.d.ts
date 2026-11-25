export function normalizePlateLetters(value: string): string;
export function normalizePlateDigits(value: string): string;
export function getDaysInMonth(year: number, month: number): number;
export type RegistrationAgeRole =
  "consumer" | "supplier" | "retailer" | "courier";

export const MINIMUM_REGISTRATION_AGE:
  Readonly<Record<RegistrationAgeRole, number>>;

export function getEgyptToday(now?: Date): string;

export function isValidCalendarDate(
  year: number, month: number, day: number
): boolean;

export function isEligibleBirthDate(
  role: RegistrationAgeRole,
  year: number,
  month: number,
  day: number,
  today?: string
): boolean;

export function isValidConsumerDate(
  year: number,
  month: number,
  day: number,
  today?: string
): boolean;

export function getLatestBirthYear(
  role: RegistrationAgeRole,
  today?: string
): number;
export function validatePlate(letters: string, digits: string, vehicleType: string): boolean;
