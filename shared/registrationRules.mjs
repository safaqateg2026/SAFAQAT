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

export function getDaysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidConsumerDate(year, month, day) {
  return [year, month, day].every(Number.isInteger)
    && year >= 1970 && year <= 2011
    && month >= 1 && month <= 12
    && day >= 1 && day <= getDaysInMonth(year, month);
}

export function validatePlate(letters, digits, vehicleType) {
  if (typeof letters !== "string" || typeof digits !== "string") return false;
  if (vehicleType === "bicycle") return letters === "" && digits === "";
  return ["rider", "car", "truck"].includes(vehicleType)
    && /^[\u0621-\u063A\u0641-\u064A]{1,3}$/u.test(letters)
    && /^[0-9٠-٩۰-۹]{1,4}$/u.test(digits);
}
