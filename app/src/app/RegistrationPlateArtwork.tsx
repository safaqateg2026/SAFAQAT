"use client";
import Image from "next/image";
import { useState } from "react";
import { normalizePlateDigits, normalizePlateLetters } from "../../../shared/registrationRules.mjs";

export type PlateArtworkProps = {
  kind: "compact" | "wide"; image: string; alt: string; lettersLabel: string; digitsLabel: string;
  letters?: string; digits?: string; editable?: boolean;
};

/** Original artwork with accessible, manually editable inputs confined to the white plate compartments. */
export default function RegistrationPlateArtwork({ kind, image, alt, lettersLabel, digitsLabel, letters = "", digits = "", editable = false }: PlateArtworkProps) {
  const dimensions = kind === "compact" ? { width: 1347, height: 1168 } : { width: 1774, height: 887 };
  const [plateLetters, setPlateLetters] = useState(normalizePlateLetters(letters));
  const [plateDigits, setPlateDigits] = useState(normalizePlateDigits(digits));
  return <div className={`registration-plate-art ${kind}`} role="group" aria-label={alt} data-plate-art={kind}>
    <Image src={image} alt="" width={dimensions.width} height={dimensions.height} unoptimized draggable={false} />
    <div className="plate-letters" aria-hidden="true">{[...plateLetters].map((character, index) => <span key={`${index}-${character}`}>{character}</span>)}</div>
    <div className="plate-digits" aria-hidden="true">{[...plateDigits].map((character, index) => <span key={`${index}-${character}`}>{character}</span>)}</div>
    {editable && <>
      <label className="plate-input-region plate-letter-input-region"><span className="plate-visually-hidden">{lettersLabel}</span>
        <input name="plateLetters" type="text" value={plateLetters} required autoComplete="off" spellCheck={false}
          aria-label={lettersLabel} aria-describedby="plate-entry-help" dir="rtl" onChange={event => setPlateLetters(normalizePlateLetters(event.target.value))} />
      </label>
      <label className="plate-input-region plate-digit-input-region"><span className="plate-visually-hidden">{digitsLabel}</span>
        <input name="plateDigits" type="text" value={plateDigits} required inputMode="numeric" autoComplete="off" spellCheck={false}
          aria-label={digitsLabel} aria-describedby="plate-entry-help" dir="ltr" onChange={event => setPlateDigits(normalizePlateDigits(event.target.value))} />
      </label>
      <span id="plate-entry-help" className="plate-visually-hidden">{lettersLabel}: 1–3 Arabic letters, separated. {digitsLabel}: 1–4 digits; Western digits are converted to Arabic-Indic digits.</span>
    </>}
    {!editable && <span className="plate-visually-hidden">{lettersLabel}: {plateLetters}; {digitsLabel}: {plateDigits}</span>}
  </div>;
}
