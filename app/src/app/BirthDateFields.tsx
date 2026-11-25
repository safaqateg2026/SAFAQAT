"use client";
import { useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import SelectionList from "./SelectionList";
import ContextHelp from "./ContextHelp";
import { getDaysInMonth, isValidConsumerDate, getEgyptToday, getLatestBirthYear } from "../../../shared/registrationRules.mjs";

export default function BirthDateFields({ language }: { language: Language }) {
  const copy = registrationMessages[language];
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(0);
  const [day, setDay] = useState(0);
  const [dateMessage, setDateMessage] = useState("");
  const numbers = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => index + from);
  const months = numbers(1, 12);
  const today = getEgyptToday();
  const years = numbers(1, getLatestBirthYear("consumer", today)).reverse();
  const valid = isValidConsumerDate(year, month, day, today);
  const days = numbers(1, getDaysInMonth(year, month));
  function changeMonth(value: string) {
    const next = Number(value); setMonth(next);
    if (day > getDaysInMonth(year, next)) { setDay(0); setDateMessage(copy.invalidDateReset); }
  }
  function changeYear(value: string) {
    const next = Number(value); setYear(next);
    if (day > getDaysInMonth(next, month)) { setDay(0); setDateMessage(copy.invalidDateReset); }
  }
  return <div className="registration-birth" role="group" aria-label={copy.birth}>
    <SelectionList label={copy.day} value={day ? String(day) : ""} options={days.map(value => ({ value: String(value), label: String(value) }))}
      onChange={value => { setDay(Number(value)); setDateMessage(""); }} language={language} placeholder={copy.select} required />
    <SelectionList label={copy.month} value={month ? String(month) : ""} options={months.map(value => ({ value: String(value), label: String(value) }))}
      onChange={changeMonth} language={language} placeholder={copy.select} required />
    <SelectionList label={copy.year} value={year ? String(year) : ""} options={years.map(value => ({ value: String(value), label: String(value) }))}
      onChange={changeYear} language={language} placeholder={copy.select} required />
    <input type="hidden" name="consumerBirthDate" value={valid ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : ""} />
    <ContextHelp label={copy.help} text={copy.consumerBirthHelp} />
    {dateMessage && <small role="status" className="registration-date-feedback">{dateMessage}</small>}
  </div>;
}
