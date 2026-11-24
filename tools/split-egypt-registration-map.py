"""Create a small national display index and exact per-governorate ADM2 assets."""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "app/public/registration-geography"


def simplify(ring, tolerance=0.012):
    # Douglas–Peucker simplification is only used for rendering the national
    # map. GPS matching reads the source ADM2 polygons instead.
    stack = [(0, len(ring) - 1)]
    keep = {0, len(ring) - 1}
    while stack:
        start, end = stack.pop()
        ax, ay = ring[start]
        bx, by = ring[end]
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        largest = tolerance
        pivot = None
        for index in range(start + 1, end):
            px, py = ring[index]
            t = min(1, max(0, ((px - ax) * dx + (py - ay) * dy) / length)) if length else 0
            distance = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if distance > largest:
                largest, pivot = distance, index
        if pivot is not None:
            keep.add(pivot)
            stack.extend(((start, pivot), (pivot, end)))
    if len(keep) < 4:
        step = max(1, len(ring) // 6)
        keep.update(range(0, len(ring), step))
    return [[round(x, 4), round(y, 4)] for x, y in (ring[index] for index in sorted(keep))]


def write(path, data):
    path.write_text(json.dumps(data, separators=(",", ":")) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    partitions = defaultdict(list)
    for row in json.loads((FOLDER / "egy-adm2-v01.json").read_text()):
        partitions[row["parent"]].append(row)
    folder = FOLDER / "map-v1"
    folder.mkdir(exist_ok=True)
    index = []
    for code, rows in sorted(partitions.items()):
        write(folder / f"{code}.json", rows)
        index.extend({field: row[field] for field in ["code", "parent", "bounds"]} for row in rows)
    outline = []
    with ZipFile(args.archive) as archive, archive.open("egy_admin1.geojson") as feature_file:
        for line in feature_file:
            if not line.startswith(b'{ "type": "Feature"'):
                continue
            feature = json.loads(line.strip().rstrip(b","))
            code = feature["properties"]["adm1_pcode"]
            geometry = feature["geometry"]
            polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
            rings = [[simplify(ring) for ring in polygon] for polygon in polygons]
            xs, ys = zip(*(point for polygon in rings for ring in polygon for point in ring))
            outline.append({"code": code, "parent": code, "bounds": [min(xs), min(ys), max(xs), max(ys)], "polygons": rings})
    assert len(outline) == len(partitions) == 27 and len(index) == 365
    write(folder / "index.json", {"outline": outline, "districts": index})


if __name__ == "__main__":
    main()
