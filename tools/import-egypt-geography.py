"""Convert the CAPMAS/OCHA COD-AB GeoJSON archive into same-origin registration data."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile


def generate(archive_path, output, catalog_file):
    with ZipFile(archive_path) as archive:
        governorates = json.load(archive.open("egy_admin1.geojson"))["features"]
        districts = json.load(archive.open("egy_admin2.geojson"))["features"]

    catalog = {}
    boundaries = []
    for feature in governorates:
        row = feature["properties"]
        code = row["adm1_pcode"]
        assert code not in catalog and row["adm1_name1"] and row["adm1_name"], code
        catalog[code] = {"code": code, "en": row["adm1_name"], "ar": row["adm1_name1"], "districts": []}
    district_codes = set()
    for feature in districts:
        row = feature["properties"]
        code = row["adm2_pcode"]
        parent = row["adm1_pcode"]
        assert code not in district_codes and row["adm2_name1"] and row["adm2_name"], code
        district_codes.add(code)
        catalog[parent]["districts"].append({"code": code, "en": row["adm2_name"], "ar": row["adm2_name1"]})
        geometry = feature["geometry"]
        assert geometry["type"] in {"Polygon", "MultiPolygon"}, code
        polygons = geometry["coordinates"]
        if geometry["type"] == "Polygon":
            polygons = [polygons]
        polygons = [[[[round(x, 5), round(y, 5)] for x, y in ring] for ring in polygon] for polygon in polygons]
        points = [point for polygon in polygons for ring in polygon for point in ring]
        xs, ys = zip(*points)
        boundaries.append({"code": code, "parent": parent, "bounds": [min(xs), min(ys), max(xs), max(ys)], "polygons": polygons})

    assert len(catalog) == 27 and len(district_codes) == 365 and all(row["districts"] for row in catalog.values())
    catalog_file.write_text(json.dumps(list(catalog.values()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    output.write_text(json.dumps(boundaries, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    generate(args.archive, root / "app/public/registration-geography/egy-adm2-v01.json",
             root / "app/src/app/egyptRegistrationCatalog.json")
