export function normalizePlateLetters(value) {
  return [...value.normalize("NFC")]
    .filter(character => /[\u0621-\u063A\u0641-\u064A]/u.test(character))
    .slice(0, 3).join("");
}

export function normalizePlateDigits(value) {
  return [...value]
    .filter(character => /[0-9٠-٩۰-۹]/u.test(character))
    .slice(0, 4)
    .map(character => {
      const arabic = "٠١٢٣٤٥٦٧٨٩".indexOf(character);
      if (arabic >= 0) return "٠١٢٣٤٥٦٧٨٩"[arabic];
      const persian = "۰۱۲۳۴۵۶۷۸۹".indexOf(character);
      if (persian >= 0) return "٠١٢٣٤٥٦٧٨٩"[persian];
      return "٠١٢٣٤٥٦٧٨٩"[Number(character)];
    }).join("");
}

export const MINIMUM_REGISTRATION_AGE = Object.freeze({
  consumer: 16,
  supplier: 18,
  retailer: 18,
  courier: 18
});

export function getEgyptToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const value = type =>
    parts.find(part => part.type === type).value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getDaysInMonth(year, month) {
  if (!year || !month) return 31;

  if (month === 2) {
    return year % 4 === 0 &&
      (year % 100 !== 0 || year % 400 === 0)
      ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidCalendarDate(year, month, day) {
  return [year, month, day].every(Number.isInteger)
    && year >= 1 && year <= 9999
    && month >= 1 && month <= 12
    && day >= 1 && day <= getDaysInMonth(year, month);
}

export function isEligibleBirthDate(
  role, year, month, day, today = getEgyptToday()
) {
  if (!Object.hasOwn(MINIMUM_REGISTRATION_AGE, role)) {
    return false;
  }

  if (!isValidCalendarDate(year, month, day)) {
    return false;
  }

  if (typeof today !== "string" ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(today)) {
    return false;
  }

  const [currentYear, currentMonth, currentDay] =
    today.split("-").map(Number);

  if (!isValidCalendarDate(
    currentYear, currentMonth, currentDay
  )) {
    return false;
  }

  let age = currentYear - year;

  if (month > currentMonth ||
      (month === currentMonth && day > currentDay)) {
    age -= 1;
  }

  return age >= MINIMUM_REGISTRATION_AGE[role];
}

export function isValidConsumerDate(
  year, month, day, today = getEgyptToday()
) {
  return isEligibleBirthDate(
    "consumer", year, month, day, today
  );
}

export function getLatestBirthYear(
  role, today = getEgyptToday()
) {
  if (!Object.hasOwn(MINIMUM_REGISTRATION_AGE, role)) {
    throw new TypeError("invalid registration role");
  }

  return Number(today.slice(0, 4)) -
    MINIMUM_REGISTRATION_AGE[role];
}

export function validatePlate(letters, digits, vehicleType) {
  if (typeof letters !== "string" || typeof digits !== "string") return false;
  if (vehicleType === "bicycle") return letters === "" && digits === "";
  return ["rider", "car", "truck"].includes(vehicleType)
    && /^[\u0621-\u063A\u0641-\u064A]{1,3}$/u.test(letters)
    && /^[0-9٠-٩۰-۹]{1,4}$/u.test(digits);
}
