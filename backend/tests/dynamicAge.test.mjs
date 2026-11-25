import test from "node:test";
import assert from "node:assert/strict";

import {
  getEgyptToday,
  getDaysInMonth,
  getLatestBirthYear,
  isEligibleBirthDate,
  isValidConsumerDate,
  isValidCalendarDate
} from "../../shared/registrationRules.mjs";

const today = "2026-11-25";

test("consumer age changes on the exact birthday", () => {
  assert.equal(
    isValidConsumerDate(2010, 11, 25, today), true
  );

  assert.equal(
    isValidConsumerDate(2010, 11, 26, today), false
  );

  assert.equal(
    isValidConsumerDate(2010, 11, 26, "2026-11-26"),
    true
  );
});

test("business and courier roles require eighteen years", () => {
  for (const role of ["supplier", "retailer", "courier"]) {
    assert.equal(
      isEligibleBirthDate(role, 2008, 11, 25, today),
      true
    );

    assert.equal(
      isEligibleBirthDate(role, 2008, 11, 26, today),
      false
    );
  }
});

test("older subscribers are not excluded by a fixed year", () => {
  for (const role of ["consumer", "supplier", "retailer", "courier"]) {
    assert.equal(
      isEligibleBirthDate(role, 1930, 1, 1, today),
      true
    );
  }
});

test("latest birth year updates automatically", () => {
  assert.equal(getLatestBirthYear("consumer", today), 2010);

  assert.equal(
    getLatestBirthYear("consumer", "2027-01-01"),
    2011
  );

  assert.equal(getLatestBirthYear("supplier", today), 2008);
});

test("Gregorian leap years are validated correctly", () => {
  assert.equal(getDaysInMonth(1900, 2), 28);
  assert.equal(getDaysInMonth(2000, 2), 29);
  assert.equal(getDaysInMonth(2100, 2), 28);
  assert.equal(getDaysInMonth(2028, 2), 29);

  assert.equal(isValidCalendarDate(2000, 2, 29), true);
  assert.equal(isValidCalendarDate(1900, 2, 29), false);
  assert.equal(isValidCalendarDate(2026, 4, 31), false);
  assert.equal(isValidCalendarDate(0, 1, 1), false);
});

test("future dates and invalid inputs are rejected", () => {
  for (const date of [
    [2030, 1, 1],
    [1990, 13, 1],
    [1990, 2, 30],
    [1990, 1, 0],
    [1990, 1, 1.5],
    [0, 1, 1]
  ]) {
    assert.equal(
      isValidConsumerDate(...date, today),
      false
    );
  }

  assert.equal(
    isEligibleBirthDate("unknown", 1990, 1, 1, today),
    false
  );

  assert.equal(
    isValidConsumerDate(1990, 1, 1, "2026-02-30"),
    false
  );
});

test("February 29 birthdays use March 1 in non-leap years", () => {
  assert.equal(
    isEligibleBirthDate(
      "supplier", 2008, 2, 29, "2026-02-28"
    ),
    false
  );

  assert.equal(
    isEligibleBirthDate(
      "supplier", 2008, 2, 29, "2026-03-01"
    ),
    true
  );
});

test("calendar date follows Egypt local midnight", () => {
  assert.equal(
    getEgyptToday(new Date("2026-11-25T21:59:59Z")),
    "2026-11-25"
  );

  assert.equal(
    getEgyptToday(new Date("2026-11-25T22:00:00Z")),
    "2026-11-26"
  );
});
