import Image from "next/image";

export type PlateArtworkProps = {
  kind: "compact" | "wide";
  image: string;
  alt: string;
  lettersLabel: string;
  digitsLabel: string;
  letters?: string;
  digits?: string;
};

/** Values are read-only display output; real registration passes no OCR values. */
export default function RegistrationPlateArtwork({ kind, image, alt, lettersLabel, digitsLabel, letters = "", digits = "" }: PlateArtworkProps) {
  const dimensions = kind === "compact" ? { width: 1347, height: 1168 } : { width: 1774, height: 887 };
  return <div className={`registration-plate-art ${kind}`} role="group" aria-label={alt}>
    <Image src={image} alt="" width={dimensions.width} height={dimensions.height} unoptimized draggable={false} />
    <span className="plate-letters" aria-label={`${lettersLabel}: ${letters}`}>
      <span className="plate-visually-hidden">{lettersLabel}</span>{letters}
    </span>
    <span className="plate-digits" aria-label={`${digitsLabel}: ${digits}`}>
      <span className="plate-visually-hidden">{digitsLabel}</span>{digits}
    </span>
  </div>;
}
