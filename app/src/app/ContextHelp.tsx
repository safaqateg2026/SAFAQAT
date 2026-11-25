"use client";
import { useId, useState } from "react";

export default function ContextHelp({ text, label }: { text: string; label: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="registration-help-wrap">
    <button type="button" className="registration-help-button" aria-label={label} aria-expanded={open} aria-controls={id}
      onClick={event => { event.stopPropagation(); setOpen(value => !value); }} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>!</button>
    {open && <span className="registration-help-popover" id={id} role="dialog" aria-label={label} onClick={event => event.stopPropagation()}>
      {text}<button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
    </span>}
  </span>;
}
