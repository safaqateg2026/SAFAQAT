const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizePlateDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, digit => {
    const index = ARABIC_DIGITS.indexOf(digit);
    return String(index >= 0 ? index : PERSIAN_DIGITS.indexOf(digit));
  }).replace(/\D/g, "");
}

export function normalizePlateLetters(value: string) {
  return value.replace(/[^ء-يٱ-ۓ]/g, "").normalize("NFC");
}

export function legacyPlateNumber(letters: string, digits: string) {
  const cleanLetters = normalizePlateLetters(letters);
  const cleanDigits = normalizePlateDigits(digits);
  return [cleanLetters, cleanDigits].filter(Boolean).join(" ");
}
