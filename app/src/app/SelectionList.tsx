"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Language } from "./landingMessages";

export type SelectionOption = { value: string; label: string };

export default function SelectionList({ label, value, options, onChange, language, placeholder, required = false, disabled = false, help, searchable = false, id: providedId }:
  { label: string; value: string; options: SelectionOption[]; onChange: (value: string) => void; language: Language; placeholder: string; required?: boolean; disabled?: boolean; help?: string; searchable?: boolean; id?: string }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const normalize = (text: string) => text
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
    .trim().toLowerCase();
  const visibleOptions = searchable && query
    ? options.filter(option => normalize(option.label).includes(normalize(query)))
    : options;
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setOpen(false);
    };
    document.addEventListener("safaqat-selection-open", closeOther);
    return () => document.removeEventListener("safaqat-selection-open", closeOther);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") setOpen(false);
      if (event instanceof MouseEvent && event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", dismiss); };
  }, [open]);

  function keyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!visibleOptions.length) return;
      if (!open) {
        document.dispatchEvent(new CustomEvent("safaqat-selection-open", { detail: id }));
        setOpen(true);
      }
      setActive(current => (current + (event.key === "ArrowDown" ? 1 : visibleOptions.length - 1)) % visibleOptions.length);
    } else if (event.key === "Home" && open) { event.preventDefault(); setActive(0); }
    else if (event.key === "End" && open) { event.preventDefault(); setActive(visibleOptions.length - 1); }
    else if ((event.key === "Enter" || event.key === " ") && open && visibleOptions[active]) {
      event.preventDefault(); onChange(visibleOptions[active].value); setOpen(false);
    }
  }

  return <div className="registration-select-field" ref={root} dir={language === "ar" ? "rtl" : "ltr"}>
    <span className="registration-select-label" id={`${id}-label`}>{label}{required ? " *" : ""}</span>
    <button type="button" className="registration-select-trigger" aria-labelledby={`${id}-label ${id}-value`}
      role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-activedescendant={open && visibleOptions[active] ? `${id}-option-${active}` : undefined} aria-controls={`${id}-listbox`} disabled={disabled} onKeyDown={keyDown} onClick={() => { setQuery(""); setActive(Math.max(0, options.findIndex(option => option.value === value))); if (!open) document.dispatchEvent(new CustomEvent("safaqat-selection-open", { detail: id }));
        setOpen(current => !current); }}>
      <span id={`${id}-value`}>{selected?.label ?? placeholder}</span><span aria-hidden="true" className="registration-select-chevron">⌄</span>
    </button>
    {required && <input className="registration-select-validity" aria-hidden="true" tabIndex={-1} required value={value} onChange={() => undefined} />}
    {open && searchable && <input
      type="search"
      inputMode="numeric"
      autoComplete="off"
      aria-label={language === "ar" ? "ابحث عن سنة الميلاد" : "Search birth year"}
      placeholder={language === "ar" ? "ابحث عن سنة الميلاد" : "Search birth year"}
      value={query}
      maxLength={4}
      onChange={event => { setQuery(event.target.value); setActive(0); }}
    />}
    {open && <div className="registration-select-menu" role="listbox" id={`${id}-listbox`} aria-labelledby={`${id}-label`}>
      {searchable && !visibleOptions.length && <small role="status">
        {language === "ar" ? "لا توجد نتائج" : "No results"}
      </small>}
      {visibleOptions.map((option, index) => <button type="button" key={option.value} id={`${id}-option-${index}`} tabIndex={-1} role="option" aria-selected={option.value === value}
        className="registration-select-option" data-active={active === index} onMouseEnter={() => setActive(index)}
        onClick={() => { onChange(option.value); setOpen(false); }}>
        {option.label}{option.value === value && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
    {help && <small className="registration-select-help">{help}</small>}
  </div>;
}
