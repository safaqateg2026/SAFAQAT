import { useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";

export default function BirthDateFields({ language }: { language: Language }) {
  const copy = registrationMessages[language];
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(0);
  const [day, setDay] = useState(0);
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const maxMonth = year === currentYear ? currentMonth : 12;
  function lastDay(selectedYear: number, selectedMonth: number) {
    if (selectedYear === currentYear && selectedMonth === currentMonth) return today.getDate();
    const leap = selectedYear === 0 || (selectedYear % 4 === 0 && (selectedYear % 100 !== 0 || selectedYear % 400 === 0));
    const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return monthDays[selectedMonth - 1] ?? 31;
  }
  function changeMonth(nextMonth: number) {
    setMonth(nextMonth);
    if (day > lastDay(year, nextMonth)) setDay(0);
  }
  function changeYear(nextYear: number) {
    setYear(nextYear);
    const nextMonth = nextYear === currentYear && month > currentMonth ? 0 : month;
    setMonth(nextMonth);
    if (day > lastDay(nextYear, nextMonth)) setDay(0);
  }
  const numbers = (count: number) => Array.from({ length: count }, (_, index) => index + 1);
  const monthFormatter = new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC", calendar: "gregory" });
  return (
    <div role="group" aria-label={copy.birth} className="registration-birth">
      <label>{copy.day}
        <select required value={day || ""} onChange={event => setDay(Number(event.target.value))}>
          <option value="">{copy.select}</option>
          {numbers(lastDay(year, month)).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>{copy.month}
        <select required value={month || ""} onChange={event => changeMonth(Number(event.target.value))}>
          <option value="">{copy.select}</option>
          {numbers(maxMonth).map(value => (
            <option key={value} value={value}>{monthFormatter.format(new Date(Date.UTC(2000, value - 1)))}</option>
          ))}
        </select>
      </label>
      <label>{copy.year}
        <select required value={year || ""} onChange={event => changeYear(Number(event.target.value))}>
          <option value="">{copy.select}</option>
          {numbers(currentYear).map(value => currentYear + 1 - value)
            .map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
  );
}
