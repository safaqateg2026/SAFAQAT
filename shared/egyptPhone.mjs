export function normalizeEgyptPhone(value) {
  if (typeof value !== "string") return "";

  let digits = value
    .replace(/[٠-٩]/g, digit =>
      String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit =>
      String(digit.charCodeAt(0) - 1776))
    .replace(/[^0-9]/g, "");

  if (digits.startsWith("0020")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("20")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits;
}
