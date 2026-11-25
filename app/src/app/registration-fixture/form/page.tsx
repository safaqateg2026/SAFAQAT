"use client";

import { useState } from "react";
import type { Language } from "../../landingMessages";
import RegistrationPreview, { type RegistrationRole } from "../../RegistrationPreview";
import "../../RegistrationPreview.css";

export default function RegistrationAcceptanceFixture() {
  const [role, setRole] = useState<RegistrationRole>("courier");
  const [language, setLanguage] = useState<Language>("ar");
  return <main className="registration-acceptance-fixture" dir={language === "ar" ? "rtl" : "ltr"}>
    <h1>SAFAQAT registration visual acceptance fixture</h1>
    <div className="registration-acceptance-fixture-controls">
      <label>Role<select value={role} onChange={event => setRole(event.target.value as RegistrationRole)}>
        <option value="courier">Courier</option><option value="merchant">Merchant</option><option value="supplier">Supplier</option>
      </select></label>
      <label>Language<select value={language} onChange={event => setLanguage(event.target.value as Language)}>
        <option value="ar">Arabic</option><option value="en">English</option>
      </select></label>
    </div>
    <RegistrationPreview role={role} language={language} />
  </main>;
}
