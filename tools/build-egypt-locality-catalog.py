"""Create a small governorate catalog from geographic place records only."""
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app/public/registration-geography/localities-v1"
DEST = ROOT / "app/public/registration-geography/localities-v2"
ALLOWED = {"city", "town", "village", "hamlet", "suburb", "neighbourhood", "quarter", "isolated_dwelling", "settlement"}
BAD_NAME = re.compile(r"(?:أبراج|ابراج|برج\s+(?!العرب)|عمارة|عمارات|عمائر|مبنى|مبان[ىي]|كمبوند|كومباوند|مجمع(?:ات)? سكن|مدينة سكن|مساكن|إسكان|اسكان|سكن طلاب|فيلات|ريزيدنس|مشروع إسكان|مشروعات سكن|أكاديمية الشرطة|مطار|ميناء|مستشفى|مدرسة|مصنع|منطقة صناعية|\b(?:police|towers?|building|buildings|compound|housing|residence|residences|resort|hostel|villa|villas|residential complex|airport|hospital|school|factory|mall|shopping center|gas station|hotel)\b)", re.I)
BAD_ADMIN = re.compile(r"^(?:قسم|إدارة شرطة|اداره شرطه|مركز شرطة|مركز شرطه|شياخة|شياخه|قسم الشرطة|قسم الشرطه)\b", re.I)
ARABIC = str.maketrans("ىةأإآؤئـ٠١٢٣٤٥٦٧٨٩", "يهاااوي 0123456789")
OWNER_ALEXANDRIA = [
    "سيدي جابر", "سيدي بشر", "سبورتنج", "الإبراهيمية", "محطة الرمل", "المنشية", "الورديان", "المكس", "الدخيلة",
    "البيطاش", "الهانوفيل", "الكيلو 21", "أبو تلات", "العطارين", "السيوف", "السيوف شماعة", "الرأس السوداء",
    "الطابية", "العصافرة", "المندرة", "ميامي", "سموحة", "محرم بك", "أبو قير", "أبو يوسف", "الصفا والمروة",
]
OWNER_ALEXANDRIA_EN = {
    "سيدي جابر": ["Sidi Gaber", "Sidi Jaber"], "سيدي بشر": ["Sidi Bishr", "Sidi Beshr"], "سبورتنج": ["Sporting"],
    "الإبراهيمية": ["Ibrahimia", "El Ibrahimeya"], "محطة الرمل": ["Raml Station"], "المنشية": ["Mansheya", "Mansheia"],
    "الورديان": ["Wardian"], "المكس": ["El Maks", "Al Maks"], "الدخيلة": ["Dekhila", "El Dekheila"],
    "البيطاش": ["Bitash", "El Bitash"], "الهانوفيل": ["Hanoville", "Hanouville"],
    "الكيلو 21": ["KM 21", "Kilometer 21", "Kilometre 21"], "أبو تلات": ["Abu Talat", "Abu Talet"],
    "العطارين": ["Attarin", "Al Attarin"], "السيوف": ["Seyouf", "Seiouf"],
    "السيوف شماعة": ["Seyouf Shamaa", "Al Seyouf Shamaa"], "الرأس السوداء": ["Ras El Soda", "Ras El Sawda"],
    "الطابية": ["Tabia", "Al Tabia"], "العصافرة": ["Asafra", "Al Asafra"], "المندرة": ["Mandara", "El Mandara"],
    "ميامي": ["Miami"], "سموحة": ["Smouha", "Semouha"], "محرم بك": ["Moharam Bek", "Moharram Bek"],
    "أبو قير": ["Abu Qir", "Abu Keir"], "أبو يوسف": ["Abu Youssef", "Abu Yousef"],
    "الصفا والمروة": ["Safa and Marwa", "El Safa Wal Marwa", "Safa Marwa"],
}


def normalize(value):
    value = unicodedata.normalize("NFKD", value.casefold()).translate(ARABIC)
    return " ".join(re.sub(r"[^\w]+", " ", value).split())


def valid(row):
    if row.get("kind") not in ALLOWED or row.get("mappedArea"):
        return False
    names = [row.get("ar", ""), row.get("en", ""), *row.get("aliases", [])]
    names = [name.strip() for name in names if name and name.strip()]
    return bool(names) and not any(BAD_NAME.search(name) or BAD_ADMIN.search(name) for name in names)


def build():
    DEST.mkdir(parents=True, exist_ok=True)
    summary = {}
    governorates = sorted(path.stem for path in (SOURCE / "capmas").glob("EG*.json"))
    for code in governorates:
        rows = []
        for source in ("capmas", "osm"):
            source_path = SOURCE / source / f"{code}.json"
            source_rows = json.loads(source_path.read_text())
            accepted = [row for row in source_rows if valid(row)]
            summary.setdefault(code, {})[source] = len(accepted)
            rows.extend({**row, "source": source} for row in accepted)
        verified_path = SOURCE / "verified" / f"{code}.json"
        if verified_path.is_file():
            verified = json.loads(verified_path.read_text())
            for row in rows:
                if verified.get("aliases", {}).get(row["id"]):
                    row["aliases"] = sorted(set(row.get("aliases", []) + verified["aliases"][row["id"]]))
            for row in verified.get("entries", []):
                if valid(row):
                    rows.append({**row, "source": "verified-reference", "district": None})
        if code == "EG02":
            for name in OWNER_ALEXANDRIA:
                key = normalize(name)
                item = next((row for row in rows if key in {normalize(candidate) for candidate in [row.get("ar", ""), row.get("en", ""), *row.get("aliases", [])] if normalize(candidate)}), None)
                if item:
                    item["aliases"] = sorted(set(item.get("aliases", []) + OWNER_ALEXANDRIA_EN[name]))
                else:
                    rows.append({"id": "owner:EG02:" + key.replace(" ", "-"), "ar": name, "en": "",
                                 "aliases": OWNER_ALEXANDRIA_EN[name], "kind": "neighbourhood", "district": None,
                                 "source": "owner-accepted-example"})
        rows.sort(key=lambda row: row["id"])
        deduped, keys = [], {}
        for row in rows:
            names = {normalize(name) for name in [row.get("ar", ""), row.get("en", ""), *row.get("aliases", [])] if normalize(name)}
            point = row.get("point")
            duplicate = None
            for key in names:
                for other in keys.get(key, []):
                    op = other.get("point")
                    same_area = other.get("district") == row.get("district")
                    same_position = not point or not op or ((point[0]-op[0])**2+(point[1]-op[1])**2)**0.5 < 0.003
                    if same_area and same_position:
                        duplicate = other
                        break
                if duplicate:
                    break
            if duplicate:
                duplicate["aliases"] = sorted(set(duplicate.get("aliases", []) + [name for name in [row.get("ar", ""), row.get("en", ""), *row.get("aliases", [])] if name]))
                continue
            deduped.append(row)
            for key in names:
                keys.setdefault(key, []).append(row)
        (DEST / f"{code}.json").write_text(json.dumps(deduped, ensure_ascii=False, separators=(",", ":")) + "\n")
        summary[code]["combined_unique"] = len(deduped)
    return summary


if __name__ == "__main__":
    report = build()
    print(json.dumps({"governorates": len(report), "counts": report}, ensure_ascii=False, indent=2))
