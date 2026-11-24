"""Build curated city/area choices and separate internal GPS mappings."""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / "app/public/registration-geography"
RAW = GEO / "localities-v1"
CURATED = GEO / "areas-v3"
INTERNAL = GEO / "area-map-v3"

ORDINAL = {"أول", "اول", "أولى", "اولى", "ثان", "ثاني", "الثاني", "ثانية", "ثانيه", "ثالث", "ثالثة", "ثالثه", "رابع", "رابعة", "رابعه"}
SKIP = re.compile(r"(?:^خارج الزمام$|^صحراء\b|^إدارة شرطة ميناء|^اداره شرطه ميناء|^قسم مارينا العلمين السياحية$|^قسم الساحل الشمالى-جزء$|^مبارك\s*[-–]\s*شرق التفريعة$)", re.I)
BAD = re.compile(r"(?:أبراج|ابراج|عمارة|عمارات|عمائر|مساكن|إسكان|اسكان|كمبوند|كومباوند|مجمع سكن|برج الأطباء|مدينة الضباط|ميناء|شرطة|\b(?:tower|towers|building|buildings|compound|housing|residence|resort|police|port)\b)", re.I)
AR_TRANSLATE = str.maketrans("ىةأإآؤئـ٠١٢٣٤٥٦٧٨٩", "يهاااوي 0123456789")

AR_DISPLAY = {
    "ابو المطامير": "أبو المطامير", "ابوحمص": "أبو حمص", "ابو حمص": "أبو حمص", "ابو طشت": "أبو طشت",
    "ابوكبير": "أبو كبير", "ابو كبير": "أبو كبير", "ادكو": "إدكو", "ايتاى البارود": "إيتاي البارود",
    "ايتاي البارود": "إيتاي البارود", "الاسكندرية": "الإسكندرية", "اسكندرية": "الإسكندرية",
    "اسيوط": "أسيوط", "بنى سويف": "بني سويف", "الوادى الجديد": "الوادي الجديد", "المنيا": "المنيا",
    "المنشاة": "المنشأة", "كفرالدوار": "كفر الدوار", "كفر الدوار": "كفر الدوار", "سيدى سالم": "سيدي سالم",
    "سيدى برانى": "سيدي براني", "سيدى جابر": "سيدي جابر", "سيدى بشر": "سيدي بشر", "ابو قير": "أبو قير",
    "ابو رديس": "أبو رديس", "راس سدر": "رأس سدر", "راس غارب": "رأس غارب", "رأس غارب": "رأس غارب",
    "شرم الشيخ": "شرم الشيخ", "سانت كاترين": "سانت كاترين", "بئر العبد": "بئر العبد", "أبوسنبل": "أبو سمبل",
    "ابوسنبل": "أبو سمبل", "أدفو": "إدفو", "ادفو": "إدفو", "كوم امبو": "كوم أمبو", "قنا": "قنا",
    "المنصورة": "المنصورة", "مدينة نصر": "مدينة نصر", "مصر الجديدة": "مصر الجديدة", "باب شرقى": "باب شرقي",
    "مينا البصل": "مينا البصل", "العامرية": "العامرية", "الجمرك": "الجمرك", "الدخيله": "الدخيلة",
    "كفرالشيخ": "كفر الشيخ", "كفر الشيخ": "كفر الشيخ", "الزقازيق": "الزقازيق", "العاشر من رمضان": "العاشر من رمضان",
    "6 اكتوبر": "6 أكتوبر", "6 أكتوبر": "6 أكتوبر", "السادات": "السادات", "راس البر": "رأس البر",
    "الساحل الشمالى": "الساحل الشمالي", "برج العرب الجديده": "برج العرب الجديدة",
    "بور فؤاد": "بورفؤاد", "بورفؤاد": "بورفؤاد", "امبابه": "إمبابة",
    "ابو قرقاص": "أبو قرقاص", "بنى مزار": "بني مزار", "اسيوط الجديدة": "أسيوط الجديدة",
    "الضواحى": "الضواحي", "نجع حمادى": "نجع حمادي", "منشأةناصر": "منشأة ناصر",
    "ابوحماد": "أبو حماد", "ابو طشت": "أبو طشت", "الفيوم": "الفيوم",
    "وادى النطرون": "وادي النطرون", "بنى سويف الجديدة": "بني سويف الجديدة",
}
COMPOSITE_SPACING = {
    "الزاويةالحمراء": "الزاوية الحمراء", "عينشمس": "عين شمس", "حدائقالقبة": "حدائق القبة",
    "مصرالجديدة": "مصر الجديدة", "مصرالقديمة": "مصر القديمة", "روضالفرج": "روض الفرج",
    "ثانمدينةنصر": "مدينة نصر", "مدينةنصر": "مدينة نصر", "برجالعرب": "برج العرب",
    "الواحاتالبحرية": "الواحات البحرية", "الواحاتالداخلة": "الواحات الداخلة", "الواحاتالخارجة": "الواحات الخارجة",
    "برجالعربالجديدة": "برج العرب الجديدة", "مدينةبرجالعربالجديدة": "مدينة برج العرب الجديدة",
    "إيتاىالبارود": "إيتاي البارود", "كفرالدوار": "كفر الدوار", "ابوالمطامير": "أبو المطامير",
    "ابوحمص": "أبو حمص", "ابوحماد": "أبو حماد", "كفرالشيخ": "كفر الشيخ", "ميناالبصل": "مينا البصل",
    "بابشرقى": "باب شرقي",
}

ALEXANDRIA = [
    ("الجمرك", "Al Gomrok", []), ("العطارين", "Al Attarin", ["العطارين شرق", "العطارين غرب"]),
    ("المنشية", "Al Mansheya", ["المنشية البحرية", "المنشية الكبرى"]), ("البيطاش", "Bitash", ["البيطاش شرق", "البيطاش غرب"]),
    ("الهانوفيل", "Hanoville", ["Hanouville", "الهانوڤيل"]), ("الدخيلة", "Al Dikhila", ["Dekhila", "الدخيله"]),
    ("الكيلو 21", "Kilometer 21", ["KM 21", "الكيلو ٢١", "Kilometre 21"]), ("أبو تلات", "Abu Talat", ["Abou Talat", "Abu Talet"]),
    ("المكس", "Al Maks", ["El Maks"]), ("الورديان", "Al Wardian", ["الورديان شرق", "الورديان غرب", "الورديان قبلي"]),
    ("سيدي جابر", "Sidi Gaber", ["Sidi Jaber", "سيدى جابر"]), ("سيدي بشر", "Sidi Bishr", ["سيدي بشر بحري", "سيدي بشر قبلي", "Sidi Beshr"]),
    ("سبورتنج", "Sporting", ["Sporting"]), ("الإبراهيمية", "Ibrahimia", ["الابراهيمية", "Ibrahimeya"]),
    ("محطة الرمل", "Raml Station", ["Raml Station"]), ("السيوف", "Al Seyouf", ["السيوف بحري", "السيوف قبلي"]),
    ("السيوف شماعة", "Seyouf Shamaa", ["السيوف شماعه", "Al Seyouf Shamaa"]), ("الرأس السوداء", "Ras El Soda", ["رأس السوداء", "Ras El Sawda"]),
    ("الطابية", "Tabia", ["طلمبات الطابية", "El Tabia"]), ("العصافرة", "Asafra", ["Al Asafra"]),
    ("المندرة", "Al Mandara", ["المندرة بحري", "المندرة قبلي", "Mandara"]), ("ميامي", "Miami", ["ميامي الجديدة"]),
    ("سموحة", "Smouha", ["Semouha"]), ("محرم بك", "Moharam Bek", ["Muharam Bik"]),
    ("أبو قير", "Abu Qir", ["أبو قير الشرقية", "أبو قير الغربية", "ابوقيرالشرقية", "ابوقيرالغربية"]),
    ("الصفا والمروة", "Safa and Marwa", ["Safa Wal Marwa", "Safa Marwa"]), ("أبو يوسف", "Abu Youssef", ["Abu Yousef"]),
    ("كفر عبده", "Kafr Abdo", []), ("الشاطبي", "Shatby", ["الشاطبى", "Chatby"]),
]


def normalize(value):
    value = "".join(char for char in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(char)).translate(AR_TRANSLATE)
    return " ".join(re.sub(r"[^\w]+", " ", value).split())


def canonical_ar(value):
    value = (value or "").strip()
    if SKIP.search(value):
        return ""
    if normalize(value) in {normalize("الساحل الشمالى")}:
        return ""
    if BAD.search(value):
        return ""
    value = re.sub(r"^(?:إدارة شرطة|اداره شرطه|مركز شرطة|مركز شرطه|قسم شرطة|قسم|مركز)\s*", "", value)
    if SKIP.search(value):
        return ""
    value = value.replace("قسم مدينة", "مدينة").replace("قسم مدينه", "مدينة")
    value = re.sub(r"^(?:أول|اول|أولى|اولى|ثان|ثاني|ثانى|ثالث|رابع)(?=مدينة|مدينه)", "", value)
    value = re.sub(r"^(?:شرق|غرب|شمال|جنوب)\s+", "", value)
    value = re.sub(r"\s+(?:شرق|غرب|شمال|جنوب)$", "", value)
    compact = re.sub(r"\s+", "", value)
    value = COMPOSITE_SPACING.get(compact, value)
    tokens = value.split()
    tokens = [token for token in tokens if token not in ORDINAL]
    value = " ".join(tokens).strip(" -–_*")
    value = re.sub(r"\s+", " ", value)
    # The numbered qisms are sections of one commonly named city.
    if normalize(value) in {"مدينة نصر", "مدينه نصر"}:
        value = "مدينة نصر"
    elif value.startswith(("مدينة ", "مدينه ")):
        value = re.sub(r"^(?:مدينة|مدينه)\s+", "", value)
    key = normalize(value)
    display = next((candidate for source, candidate in AR_DISPLAY.items() if normalize(source) == key), value)
    return display


def canonical_en(value):
    value = (value or "").strip()
    value = re.sub(r"^(?:First|Second|Third|Fourth|Qism|District|Markaz|Center|Police Section|Section)\s+", "", value, flags=re.I)
    value = re.sub(r"^(?:City of|New City of)\s+", "", value, flags=re.I)
    value = re.sub(r"\b(?:First|Second|Third|Fourth)\b", "", value, flags=re.I)
    return " ".join(value.split()).strip(" -–_")


def area_id(name):
    return "area-" + normalize(name).replace(" ", "-")


def load_source_rows(code):
    rows = []
    for source in ("capmas", "osm"):
        path = RAW / source / f"{code}.json"
        rows.extend({**row, "source": source} for row in json.loads(path.read_text()))
    verified = RAW / "verified" / f"{code}.json"
    if verified.exists():
        data = json.loads(verified.read_text())
        for row in rows:
            row["aliases"] = list(dict.fromkeys([*(row.get("aliases") or []), *data.get("aliases", {}).get(row["id"], [])]))
        rows.extend({**row, "source": "verified-reference"} for row in data.get("entries", []))
    return rows


def build_governorate(governorate):
    code = governorate["code"]
    grouped = {}
    district_to_area = {}
    unmapped = []
    for district in governorate["districts"]:
        name = canonical_ar(district["ar"])
        if not name:
            unmapped.append(district["code"])
            continue
        key = normalize(name)
        row = grouped.setdefault(key, {"id": area_id(name), "ar": name, "en": canonical_en(district.get("en", "")), "aliases": set(), "districts": []})
        if not row["en"]:
            row["en"] = canonical_en(district.get("en", ""))
        row["districts"].append(district["code"])
        for candidate in (district["ar"], district.get("en", "")):
            if candidate and normalize(candidate) != key:
                row["aliases"].add(candidate)
        district_to_area[district["code"]] = row["id"]

    rows = list(grouped.values())
    # Add independently classified OSM city/town names only when a matching
    # CAPMAS populated-place record corroborates the place in the same area.
    source_rows = load_source_rows(code)
    official = [row for row in source_rows if row.get("source") == "capmas" and row.get("id", "").startswith("pp:")]
    for row in source_rows:
        if row.get("source") != "osm" or row.get("kind") not in {"city", "town"} or row.get("mappedArea") or not row.get("point"):
            continue
        names = [row.get("ar", ""), row.get("en", ""), *(row.get("aliases") or [])]
        keys = {normalize(name) for name in names if name and not BAD.search(name)}
        corroborated = next((official_row for official_row in official
            if official_row.get("district") == row.get("district") and keys & {normalize(name) for name in [official_row.get("ar", ""), official_row.get("en", ""), *(official_row.get("aliases") or [])] if name}), None)
        if not corroborated:
            continue
        name = canonical_ar(row.get("ar") or corroborated.get("ar") or "")
        if not name or normalize(name) in grouped:
            continue
        key = normalize(name)
        area = {"id": area_id(name), "ar": name, "en": canonical_en(row.get("en") or corroborated.get("en", "")),
                "aliases": set(row.get("aliases") or []), "districts": []}
        if row.get("district") in district_to_area:
            area["districts"].append(row["district"])
        grouped[key] = area
        rows.append(area)

    if code == "EG02":
        for name, english, aliases in ALEXANDRIA:
            key = normalize(name)
            existing = grouped.get(key)
            if existing:
                if existing["en"] and normalize(existing["en"]) != normalize(english):
                    existing["aliases"].add(existing["en"])
                existing["en"] = english
                existing["aliases"].update(aliases)
                continue
            area = {"id": area_id(name), "ar": name, "en": english, "aliases": set(aliases), "districts": []}
            grouped[key] = area
            rows.append(area)

    rows.sort(key=lambda row: (normalize(row["ar"]), row["id"]))
    # Curated public payload intentionally contains display names/search aliases
    # only. Administrative codes and source records live in the separate map.
    public = [{"id": row["id"], "ar": row["ar"], "en": row["en"], "aliases": sorted(row["aliases"])} for row in rows]

    alias_to_ids = defaultdict(set)
    for row in rows:
        for name in [row["ar"], row["en"], *row["aliases"]]:
            if name:
                alias_to_ids[normalize(name)].add(row["id"])
    # Match exact place labels/known variants to internal coordinates only;
    # never turn these raw source rows into user-facing selector rows.
    exact_points, seen_points = [], set()
    for source in source_rows:
        point = source.get("point")
        if not point or len(point) != 2:
            continue
        names = [source.get("ar", ""), source.get("en", ""), *(source.get("aliases") or [])]
        if source.get("id", "").startswith("cp:"):
            # CAPMAS east/west and numbered census sections are deliberately
            # mapped to their parent area, never emitted as a choice.
            names += source.get("ar", "").replace("_", " ").split("-")
        targets = set()
        for name in names:
            if not name or BAD.search(name):
                continue
            targets.update(alias_to_ids.get(normalize(name), set()))
        if len(targets) != 1:
            continue
        target = next(iter(targets))
        district = source.get("district")
        if district in district_to_area and target != district_to_area[district]:
            # A precisely recognized area may refine its broader parent area.
            pass
        key = (target, round(point[0], 5), round(point[1], 5))
        if key in seen_points:
            continue
        seen_points.add(key)
        exact_points.append({"area": target, "point": point})

    for name, _english, aliases in ALEXANDRIA if code == "EG02" else []:
        key = normalize(name)
        target = grouped[key]["id"]
        for source in source_rows:
            point = source.get("point")
            if not point:
                continue
            source_names = [source.get("ar", ""), source.get("en", ""), *(source.get("aliases") or [])]
            source_norm = {normalize(value) for value in source_names if value}
            if key not in source_norm and not source_norm.intersection({normalize(value) for value in aliases}):
                continue
            if BAD.search(" ".join(source_names)):
                continue
            item = {"area": target, "point": point}
            sig = (target, round(point[0], 5), round(point[1], 5))
            if sig not in seen_points:
                exact_points.append(item)
                seen_points.add(sig)

    internal = {"districtToArea": district_to_area, "unmappedDistricts": unmapped, "exactPoints": exact_points}
    return public, internal


def build():
    CURATED.mkdir(parents=True, exist_ok=True)
    INTERNAL.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((ROOT / "app/src/app/egyptRegistrationCatalog.json").read_text())
    summary = {}
    for governorate in catalog:
        public, internal = build_governorate(governorate)
        code = governorate["code"]
        (CURATED / f"{code}.json").write_text(json.dumps(public, ensure_ascii=False, separators=(",", ":")) + "\n")
        (INTERNAL / f"{code}.json").write_text(json.dumps(internal, ensure_ascii=False, separators=(",", ":")) + "\n")
        summary[code] = {"governorate": governorate["ar"], "areas": len(public), "internal_divisions": len(internal["districtToArea"]),
                         "unmapped_nonlocality_divisions": len(internal["unmappedDistricts"]), "gps_features": len(internal["exactPoints"])}
    return summary


if __name__ == "__main__":
    summary = build()
    print(json.dumps({"governorates": len(summary), "total_areas": sum(row["areas"] for row in summary.values()), "coverage": summary}, ensure_ascii=False, indent=2))
