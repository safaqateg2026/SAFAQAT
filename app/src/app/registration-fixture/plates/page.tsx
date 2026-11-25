import type { Metadata } from "next";
import RegistrationPlateArtwork from "../../RegistrationPlateArtwork";
import "../../RegistrationPreview.css";

export const metadata: Metadata = {
  title: "SAFAQAT plate alignment fixture",
  robots: { index: false, follow: false },
};

const examples = [
  { title: "Motorcycle / motorized tricycle", kind: "compact" as const, image: "/images/vehicle-plates/motorcycle-light-blue.png" },
  { title: "Private car", kind: "wide" as const, image: "/images/vehicle-plates/car-blue.png" },
  { title: "Transport vehicle", kind: "wide" as const, image: "/images/vehicle-plates/transport-red.png" },
];

export default function PlateAlignmentFixture() {
  return <main className="plate-alignment-fixture" dir="rtl">
    <h1>معاينة محاذاة اللوحات · قيم اصطناعية للاختبار فقط</h1>
    {examples.map(example => <section key={example.image} aria-label={example.title}>
      <h2>{example.title}</h2>
      <RegistrationPlateArtwork kind={example.kind} image={example.image} alt={example.title}
        lettersLabel="حروف اللوحة" digitsLabel="أرقام اللوحة" letters="س ب ي" digits="٤٣٦٣" />
    </section>)}
  </main>;
}
