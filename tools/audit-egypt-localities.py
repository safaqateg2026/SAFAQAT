"""Verify the static locality and map assets and report coverage, one governorate at a time."""
import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEOGRAPHY = ROOT / "app/public/registration-geography"
CURATED = GEOGRAPHY / "localities-v2"

def normalized_name(value):
    value = value.casefold().translate(str.maketrans("ىةأإآؤئـ٠١٢٣٤٥٦٧٨٩", "يهاااوي 0123456789"))
    return " ".join(re.sub(r"[^\w]+", " ", value).split())


def point_valid(point):
    return (len(point) == 2 and all(isinstance(value, (float, int)) and math.isfinite(value) for value in point)
            and 20 <= point[0] <= 38 and 20 <= point[1] <= 34)


def audit():
    catalog = json.loads((ROOT / "app/src/app/egyptRegistrationCatalog.json").read_text())
    assert len(catalog) == len({row["code"] for row in catalog}) == 27
    index = json.loads((GEOGRAPHY / "map-v1/index.json").read_text())
    assert len(index["outline"]) == 27 and len(index["districts"]) == 365
    report = []
    seen = set()
    for governorate in catalog:
        code = governorate["code"]
        districts = {row["code"]: row["ar"] for row in governorate["districts"]}
        boundaries = json.loads((GEOGRAPHY / f"map-v1/{code}.json").read_text())
        assert {row["code"] for row in boundaries} == set(districts), code
        assert all(row["parent"] == code and row["polygons"] for row in boundaries), code
        summary = {"code": code, "governorate": governorate["ar"]}
        covered = set()
        labels = Counter()
        expected_areas = {}
        added_source_ids = set()
        for source in ("capmas", "osm"):
            entries = json.loads((GEOGRAPHY / f"localities-v1/{source}/{code}.json").read_text())
            summary[source] = len(entries)
            assert entries, (code, source)
            for row in entries:
                assert row["id"] not in seen and (row["ar"] or row["en"]), (code, row["id"])
                seen.add(row["id"])
                assert row["district"] in districts and point_valid(row["point"]), (code, row["id"])
                if row.get("mappedArea"):
                    assert source == "osm"
                    expected_areas[row["id"]] = row["district"]
                added_source_ids.add(row["id"])
                covered.add(row["district"])
                labels.update(arabic=bool(row["ar"]), english=bool(row["en"]), polygons=bool(row.get("mappedArea")))
        no_polygons = []
        for district in districts:
            areas = json.loads((GEOGRAPHY / f"localities-v1/osm-areas/{district}.json").read_text())
            if not areas:
                no_polygons.append(district)
            for identifier, ring in areas.items():
                assert expected_areas.pop(identifier) == district, identifier
                assert len(ring) >= 4 and ring[0] == ring[-1], identifier
                assert all(point_valid(point) for point in ring), identifier
        assert not expected_areas
        verified_asset = GEOGRAPHY / f"localities-v1/verified/{code}.json"
        summary["verified_local_names"] = 0
        if verified_asset.is_file():
            verification = json.loads(verified_asset.read_text())
            for identifier, aliases in verification["aliases"].items():
                assert identifier in added_source_ids and aliases, identifier
            for entry in verification["entries"]:
                assert entry["id"] not in seen and entry["reference"].startswith("https://")
                assert entry["ar"] and entry["en"] and "point" not in entry, entry["id"]
                labels.update(arabic=True, english=True)
                seen.add(entry["id"])
            summary["verified_local_names"] = len(verification["entries"])
        summary.update(labels)
        summary["districts_without_locality_polygons"] = no_polygons
        summary["missing_districts"] = [name for district, name in districts.items() if district not in covered]
        report.append(summary)
    filtered = {}
    invalid_tokens = re.compile(r"(?:ابراج|أبراج|برج\s+(?!العرب)|عمارة|عمارات|عمائر|كمبوند|كومباوند|مجمع(?:ات)? سكن|مساكن|اسكان|إسكان|سكن طلاب|فيلات|ريزيدنس|مطار|ميناء|مستشفى|مدرسة|مصنع|منطقة صناعية|أكاديمية الشرطة|\b(?:police|tower|towers|building|buildings|compound|housing|residence|residences|resort|hostel|villa|villas|airport|hospital|school|factory|mall|hotel)\b)", re.I)
    for governorate in catalog:
        code = governorate["code"]
        entries = json.loads((CURATED / f"{code}.json").read_text())
        names = [normalized_name(name) for row in entries for name in [row.get("ar", ""), row.get("en", ""), *row.get("aliases", [])] if name]
        assert len(entries) == len({row["id"] for row in entries}), code
        assert all(row.get("kind") in {"city", "town", "village", "hamlet", "suburb", "neighbourhood", "quarter", "isolated_dwelling", "settlement"} for row in entries)
        assert all(not row.get("mappedArea") and not row.get("ring") for row in entries), code
        assert all(not row.get("point") or point_valid(row["point"]) for row in entries), code
        assert all(row.get("source") in {"capmas", "osm", "verified-reference", "owner-accepted-example"} for row in entries), code
        assert all(not invalid_tokens.search(name) for name in names), code
        assert not any("ابراج القاهره" in name or "ابراج المعتز" in name for name in names), code
        assert not any(re.match(r"^(?:قسم(?:\s|$)|إدارة شرطة|اداره شرطه|مركز شرطة|مركز شرطه)", name) or re.search(r"\bpolice\b", name, re.I) for name in names), code
        assert sum(row.get("source") == "capmas" for row in entries) > 0, code
        assert sum(row.get("source") == "osm" for row in entries) > 0, code
        filtered[code] = {"governorate": governorate["ar"], "capmas": sum(row.get("source") == "capmas" for row in entries),
                          "osm_place_records": sum(row.get("source") == "osm" for row in entries),
                          "verified_reference": sum(row.get("source") == "verified-reference" for row in entries),
                          "owner_accepted_name": sum(row.get("source") == "owner-accepted-example" for row in entries),
                          "unique_localities": len(entries), "mapped_areas_in_dropdown": 0,
                          "coverage_status": "partial; national locality completeness not independently verified"}
    expected = {
        "EG02": "سيدي جابر|سيدي بشر|سبورتنج|الإبراهيمية|محطة الرمل|المنشية|الورديان|المكس|الدخيلة|البيطاش|الهانوفيل|الكيلو 21|أبو تلات|العطارين|السيوف|السيوف شماعة|الرأس السوداء|الطابية|العصافرة|المندرة|ميامي|سموحة|محرم بك|أبو قير|أبو يوسف|الصفا والمروة".split("|"),
        "EG18": "دمنهور|أبو حمص|كفر الدوار|إدكو|رشيد|حوش عيسى|أبو المطامير|كوم حمادة|الدلنجات|إيتاي البارود|شبراخيت|المحمودية|الرحمانية".split("|")}
    for code, examples in expected.items():
        entries = json.loads((CURATED / f"{code}.json").read_text())
        available = {normalized_name(name) for row in entries for name in [row.get("ar", ""), row.get("en", ""), *row.get("aliases", [])] if name}
        missing = [name for name in examples if normalized_name(name) not in available]
        assert not missing, f"{code}: required examples missing: {missing}"
    return {"source_structure": report, "curated": filtered, "total_curated": sum(row["unique_localities"] for row in filtered.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = audit()
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.write_text(payload)
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
