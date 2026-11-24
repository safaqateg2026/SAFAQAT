"""Verify the static locality and map assets and report coverage, one governorate at a time."""
import argparse
import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEOGRAPHY = ROOT / "app/public/registration-geography"


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
    return report


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
