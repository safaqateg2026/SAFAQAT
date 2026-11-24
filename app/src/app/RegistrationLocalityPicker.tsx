import { useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import { searchLocalities, type IndexedLocality } from "./registrationLocalities";

export default function RegistrationLocalityPicker({ language, enabled, records, value, loading, failed, onSelect }:
  { language: Language; enabled: boolean; records: IndexedLocality[]; value: string; loading: boolean;
    failed: boolean; onSelect: (id: string) => void }) {
  const copy = registrationMessages[language];
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(30);
  const selected = records.find(record => record.id === value);
  const results = searchLocalities(records, query);
  return (
    <div className="registration-localities">
      <label>{copy.district}
        <input type="search" autoComplete="off" disabled={!enabled}
          placeholder={copy.localitySearch} value={selected?.label ?? query}
          required={!selected} ref={input => {
            input?.setCustomValidity(selected || !enabled ? "" : copy.localityRequired);
          }}
          onChange={event => { setQuery(event.target.value); setPageSize(30); onSelect(""); }} />
      </label>
      {selected && <div className="registration-locality-current" role="status">
        <span>{selected.label}{selected.context ? ` · ${selected.context}` : ""}</span>
        <button type="button" onClick={() => { setQuery(""); onSelect(""); }}>{copy.changeLocality}</button>
      </div>}
      {!selected && enabled && <div className="registration-locality-results">
        <p role="status">{failed ? copy.localityUnavailable : loading ? copy.localitiesLoading :
          records.length === 0 ? copy.localityUnavailable : results.length ? copy.localityCount.replace("{count}", String(results.length)) : copy.localityNoResults}</p>
        {results.slice(0, pageSize).map(record =>
          <button type="button" key={record.id} onClick={() => { setQuery(""); onSelect(record.id); }}>
            <span>{record.label}</span><small>{record.context}</small>
          </button>)}
        {results.length > pageSize && <button type="button" onClick={() => setPageSize(size => size + 30)}>{copy.moreLocalities}</button>}
      </div>}
      <small className="registration-geography-credit">
        <a dir="ltr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
        {" · "}<a dir="ltr" href="https://data.humdata.org/dataset/cod-ab-egy" target="_blank" rel="noreferrer">CAPMAS / OCHA HDX</a>
      </small>
    </div>
  );
}
