import { useId, useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import { searchAreas, type IndexedArea } from "./registrationLocalities";

export default function RegistrationLocalityPicker({ language, enabled, records, value, loading, failed, onSelect, kind = "locality" }:
  { language: Language; enabled: boolean; records: Pick<IndexedArea, "id" | "label" | "search">[]; value: string; loading: boolean;
    failed: boolean; kind?: "locality" | "governorate"; onSelect: (id: string) => void }) {
  const copy = registrationMessages[language];
  const uid = useId();
  const validationId = `${uid}-validation`;
  const listId = `${uid}-list`;
  const fieldLabel = kind === "governorate" ? copy.governorate : copy.district;
  const searchLabel = kind === "governorate"
    ? (language === "ar" ? "اختر المحافظة وابحث بالاسم" : "Select or search governorate")
    : copy.localitySearch;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const selected = records.find(record => record.id === value);
  const results = searchAreas(records, query);
  return (
    <div className="registration-localities">
      <label htmlFor={validationId}>{fieldLabel}</label>
      <select id={validationId} aria-label={fieldLabel} className="registration-locality-validation" required value={selected?.id ?? ""}
        onChange={() => undefined} tabIndex={-1}><option value="" />
        {selected && <option value={selected.id}>{selected.label}</option>}
      </select>
      <div className="registration-locality-menu">
        <div className="registration-locality-input">
        <input type="search" autoComplete="off" aria-label={searchLabel} aria-controls={listId}
          disabled={!enabled || failed} placeholder={selected?.label ?? (failed ? copy.localityUnavailable : loading ? copy.localitiesLoading : searchLabel)}
          value={expanded ? query : selected?.label ?? ""} onFocus={() => { if (!expanded) { setQuery(""); setExpanded(true); } }}
          onClick={() => { if (!expanded) { setQuery(""); setExpanded(true); } }}
          role="combobox" aria-expanded={expanded} aria-autocomplete="list" onChange={event => { setQuery(event.target.value); onSelect(""); setExpanded(true); }} />
        {(query || selected) && <button className="registration-locality-clear" type="button" aria-label={language === "ar" ? "مسح الاختيار" : "Clear selection"} onClick={() => { setQuery(""); onSelect(""); setExpanded(true); }}>×</button>}
        </div>
      {expanded && enabled && <>
        <div id={listId} className="registration-locality-results" role="listbox">
          {loading ? <p role="status">{copy.localitiesLoading}</p> : failed || records.length === 0 ? <p role="status">{copy.localityUnavailable}</p> :
            results.length ? results.map(record =>
              <button role="option" aria-selected={record.id === value} type="button" key={record.id}
                onClick={() => { setQuery(record.label); onSelect(record.id); setExpanded(false); }}>
                <span>{record.label}</span>
              </button>) : <p role="status">{copy.localityNoResults}</p>}
        </div>
      </>}
      </div>
      {kind === "locality" && <small className="registration-geography-credit">
        <a dir="ltr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
        {" · "}<a dir="ltr" href="https://data.humdata.org/dataset/cod-ab-egy" target="_blank" rel="noreferrer">CAPMAS / OCHA HDX</a>
      </small>}
    </div>
  );
}
