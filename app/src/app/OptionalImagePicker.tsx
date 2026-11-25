"use client";

import Image from "next/image";

import { useEffect, useRef, useState } from "react";
import type { Language } from "./landingMessages";
import { registrationMessages } from "./registrationMessages";
import ContextHelp from "./ContextHelp";

const maxBytes = 5 * 1024 * 1024;

export default function OptionalImagePicker({ language, label, name, defaultImage, compact = false }: {
  language: Language; label: string; name: string; defaultImage?: string; compact?: boolean;
}) {
  const copy = registrationMessages[language];
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(file?: File) {
    setError("");
    if (!file) return;
    if (file.size > maxBytes) { setError(copy.imageTooLarge); return; }
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!png && !jpeg && !webp) { setError(copy.invalidImage); return; }
    const candidate = URL.createObjectURL(file);
    try {
      const image = new window.Image();
      image.src = candidate;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight ||
          image.naturalWidth * image.naturalHeight > 25000000) {
        throw new Error("Invalid image dimensions");
      }
      setPreview(candidate);
    } catch {
      URL.revokeObjectURL(candidate);
      setError(copy.invalidImage);
    }
  }

  return <div className={`registration-optional-image${compact ? " is-compact" : ""}`} data-image-field={name}>
    <div className="registration-optional-image-actions">
      <button type="button" onClick={() => input.current?.click()}>{label}</button>
      <ContextHelp label={copy.help} text={copy.optionalPhotoHelp} />
    </div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={label}
      onChange={event => { void choose(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    {(preview || defaultImage) && <div className="registration-image-preview">
      <Image src={preview || defaultImage || ""} alt={copy.imagePreview} width={512} height={512} unoptimized style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "8rem", objectFit: "contain" }} />
      {preview && <button type="button" onClick={() => setPreview("")}>{copy.removeImage}</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
    <small>{copy.optionalPhoto}</small>
  </div>;
}
