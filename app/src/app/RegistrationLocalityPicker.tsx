import { useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import { searchLocalities, type IndexedLocality } from "./registrationLocalities";

export default function RegistrationLocalityPicker({ language, enabled, records, value, loading, failed, onSelect }:
  { language: Language; enabled: boolean; records: IndexedLocality[]; value: string; loading: boolean;
    failed: boolean; onSelect: (id: string) => void }) {
  const copy = registrationMessages[language];
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const selected = records.find(record => record.id === value);
  const results = searchLocalities(records, query);
  return (
    <div className="registration-localities">
      <label htmlFor="registration-locality-validation">{copy.district}</label>
      <select id="registration-locality-validation" aria-label={copy.district} className="registration-locality-validation" required value={selected?.id ?? ""}
        onChange={() => undefined} tabIndex={-1}><option value="" />
        {selected && <option value={selected.id}>{selected.label}</option>}
      </select>
      <button type="button" className="registration-locality-trigger" disabled={!enabled || failed}
        aria-haspopup="listbox" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <span>{selected ? `${selected.label}${selected.context ? ` · ${selected.context}` : ""}` :
          failed ? copy.localityUnavailable : loading ? copy.localitiesLoading : copy.localitySearch}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {expanded && enabled && <div className="registration-locality-menu">
        <input type="search" autoComplete="off" autoFocus aria-label={copy.localitySearch} aria-controls="registration-locality-list"
          placeholder={copy.localitySearch} value={query} onChange={event => setQuery(event.target.value)} />
        <div id="registration-locality-list" className="registration-locality-results" role="listbox">
          {loading ? <p role="status">{copy.localitiesLoading}</p> : failed || records.length === 0 ? <p role="status">{copy.localityUnavailable}</p> :
            results.length ? results.map(record =>
              <button role="option" aria-selected={record.id === value} type="button" key={record.id}
                onClick={() => { setQuery(""); onSelect(record.id); setExpanded(false); }}>
                <span>{record.label}</span>{record.context && <small>{record.context}</small>}
              </button>) : <p role="status">{copy.localityNoResults}</p>}
        </div>
      </div>}
      {selected && <button type="button" className="registration-locality-change" onClick={() => { setQuery(""); onSelect(""); setExpanded(true); }}>{copy.changeLocality}</button>}
      <small className="registration-geography-credit">
        <a dir="ltr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
        {" · "}<a dir="ltr" href="https://data.humdata.org/dataset/cod-ab-egy" target="_blank" rel="noreferrer">CAPMAS / OCHA HDX</a>
      </small>
    </div>
  );
}
