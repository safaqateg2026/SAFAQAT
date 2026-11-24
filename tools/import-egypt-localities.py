"""Build versioned, per-governorate residential catalogs from OCHA CAPMAS and OSM."""
import argparse
import collections
import json
import hashlib
import re
import sqlite3
import unicodedata
from pathlib import Path
from zipfile import ZipFile

import osmium

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "app/public/registration-geography/localities-v1"
PLACE_TYPES = {"city", "town", "village", "hamlet", "suburb", "neighbourhood", "quarter", "isolated_dwelling"}
ARABIC = re.compile(r"[\u0600-\u06ff]")
LATIN = re.compile(r"[a-z]", re.I)


def normalize(name):
    name = unicodedata.normalize("NFKD", name.casefold()).translate(
        str.maketrans("ىةؤئـ٠١٢٣٤٥٦٧٨٩", "يهوي 0123456789"))
    return " ".join("".join(
        char if char.isalnum() else " " if not unicodedata.combining(char) else "" for char in name
    ).split())


def source_features(archive, layer):
    # The published GDAL GeoJSON archive holds one Feature per line.
    with archive.open(f"egy_{layer}.geojson") as file:
        for line in file:
            if line.startswith(b'{ "type": "Feature"'):
                yield json.loads(line.strip().rstrip(b","))


def contains(point, polygon):
    x, y = point
    for index, ring in enumerate(polygon):
        inside = False
        previous = ring[-1]
        for current in ring:
            ax, ay = previous
            bx, by = current
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                inside = not inside
            previous = current
        if inside == bool(index):
            return False
    return True


class Builder:
    def __init__(self, database):
        self.db = sqlite3.connect(database)
        self.db.executescript("""
            PRAGMA cache_size = -16000;
            CREATE TABLE district (id INTEGER PRIMARY KEY, code TEXT, parent TEXT, geometry TEXT);
            CREATE VIRTUAL TABLE district_bounds USING rtree(id, west, east, south, north);
            CREATE TABLE locality (source TEXT, governorate TEXT, id TEXT PRIMARY KEY, item TEXT);
            CREATE INDEX locality_governorate ON locality(governorate, source);
        """)
        self.omitted = collections.Counter()
        self.district_parents = {}

    def add_district(self, feature):
        props = feature["properties"]
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        row = self.db.execute("INSERT INTO district(code,parent,geometry) VALUES (?,?,?)",
                              (props["adm2_pcode"], props["adm1_pcode"], json.dumps(polygons)))
        points = [point for polygon in polygons for ring in polygon for point in ring]
        self.district_parents[props["adm2_pcode"]] = props["adm1_pcode"]
        xs, ys = zip(*points)
        self.db.execute("INSERT INTO district_bounds VALUES (?,?,?,?,?)",
                        (row.lastrowid, min(xs), max(xs), min(ys), max(ys)))

    def lookup(self, point):
        x, y = point
        matches = self.db.execute("""
            SELECT code, parent, geometry FROM district JOIN district_bounds USING(id)
            WHERE west <= ?1 AND east >= ?1 AND south <= ?2 AND north >= ?2
        """, (x, y))
        found = [(code, parent) for code, parent, geometry in matches
                 if any(contains(point, polygon) for polygon in json.loads(geometry))]
        return found[0] if len(found) == 1 else None

    def add(self, source, identifier, ar, en, kind, point, membership, aliases=(), ring=None):
        if not ar and not en:
            self.omitted[f"{source}: no name"] += 1
            return
        if not membership or self.district_parents.get(membership[0]) != membership[1]:
            self.omitted[f"{source}: no unambiguous governorate"] += 1
            return
        code, parent = membership
        item = {"id": identifier, "ar": ar, "en": en, "kind": kind, "point": point, "district": code}
        seen = {normalize(ar), normalize(en), ""}
        extra = []
        for name in aliases:
            key = normalize(name)
            if key not in seen:
                seen.add(key)
                extra.append(name)
        if extra:
            item["aliases"] = extra
        if ring:
            item["ring"] = ring
        self.db.execute("INSERT INTO locality VALUES (?,?,?,?)",
                        (source, parent, identifier, json.dumps(item, ensure_ascii=False, separators=(",", ":"))))

    def official(self, archive):
        # This dataset explicitly lists populated places. Shape-derived entries
        # below cover named census settlements as an independent official layer.
        for feature in source_features(archive, "populatedplaces"):
            p = feature["properties"]
            point = feature["geometry"]["coordinates"]
            ar = (p.get("featurename_ar") or "").strip()
            en = (p.get("featurename_en") or "").strip()
            code = (p.get("pcode") or "").strip()
            identifier = code or hashlib.sha256(json.dumps([ar, en, point], ensure_ascii=False).encode()).hexdigest()[:20]
            membership = (p["adm2_pcode"], p["adm1_pcode"])
            if self.district_parents.get(membership[0]) != membership[1]:
                membership = self.lookup(point)
            self.add("capmas", "pp:" + identifier, ar, en, "settlement", point, membership)
        for feature in source_features(archive, "admin3"):
            p = feature["properties"]
            ar, en = (p.get("adm3_name1") or "").strip(), (p.get("adm3_name") or "").strip()
            name = normalize(ar)
            if (not name or name.startswith(("قسم ", "مركز ", "ظهير ", "الظهير ", "باقي ", "باقى "))
                    or name in {"اول", "اولي", "ثان", "ثانيه", "ثاني", "ثالث", "ثالثه", "رابع", "رابعه"}):
                self.omitted["capmas: computational or ambiguous census label"] += 1
                continue
            kind = "hamlet" if name.startswith(("عزبه ", "نجع ", "كفر ")) else "settlement"
            point = [p.get("center_lon"), p.get("center_lat")]
            if None in point:
                self.omitted["capmas: missing center"] += 1
                continue
            polygons = feature["geometry"]["coordinates"]
            if feature["geometry"]["type"] == "Polygon":
                polygons = [polygons]
            if not any(contains(point, polygon) for polygon in polygons):
                self.omitted["capmas: center outside census geometry"] += 1
                continue
            self.add("capmas", "cp:" + p["adm3_pcode"], ar, en, kind, point, (p["adm2_pcode"], p["adm1_pcode"]))

    def export(self, governorates):
        DESTINATION.mkdir(parents=True, exist_ok=True)
        coverage = {}
        for code in governorates:
            coverage[code] = {}
            for source in ("capmas", "osm"):
                folder = DESTINATION / source
                folder.mkdir(exist_ok=True)
                rows = self.db.execute("SELECT item FROM locality WHERE governorate=? AND source=? ORDER BY id", (code, source))
                items = [json.loads(row[0]) for row in rows]
                if source == "capmas":
                    excluded_prefixes = ("خارج الزمام", "مطار ", "المطار ", "ميناء", "الميناء",
                                         "المنطقه الصناعيه", "شياخه المنطقه الصناعيه")
                    items = [item for item in items if not (item["id"].startswith("cp:")
                             and normalize(item["ar"]).startswith(excluded_prefixes))]
                coverage[code][source] = {
                    "total": len(items), "arabic": sum(bool(item["ar"]) for item in items),
                    "english": sum(bool(item["en"]) for item in items),
                    "polygons": sum("ring" in item for item in items),
                }
                if source == "osm":
                    areas_folder = DESTINATION / "osm-areas"
                    areas_folder.mkdir(exist_ok=True)
                    areas = collections.defaultdict(dict)
                    for item in items:
                        ring = item.pop("ring", None)
                        if ring:
                            areas[item["district"]][item["id"]] = ring
                            item["mappedArea"] = True
                    for district in self.db.execute("SELECT code FROM district WHERE parent=?", (code,)):
                        code2 = district[0]
                        (areas_folder / f"{code2}.json").write_text(json.dumps(areas[code2], separators=(",", ":")) + "\n")
                (folder / f"{code}.json").write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(json.dumps({"counts": coverage, "omitted": self.omitted}, ensure_ascii=False, indent=2))


class Places(osmium.SimpleHandler):
    def __init__(self, builder):
        super().__init__()
        self.builder = builder

    def add_tags(self, tags, identifier, point, ring=None):
        kind = tags.get("place")
        if kind not in PLACE_TYPES:
            if not ring or tags.get("landuse") != "residential":
                return
            kind = "neighbourhood"
        name = (tags.get("name") or "").strip()
        ar = (tags.get("name:ar") or (name if ARABIC.search(name) else "")).strip()
        en = (tags.get("name:en") or (name if not ARABIC.search(name) and LATIN.search(name) else "")).strip()
        if not (ar or en):
            return
        aliases = [value.strip() for key in ("name", "alt_name", "alt_name:ar", "alt_name:en", "short_name",
                                           "loc_name", "official_name", "name:arz", "int_name")
                   for value in (tags.get(key) or "").split(";") if value.strip()]
        self.builder.add("osm", identifier, ar, en, kind, point, self.builder.lookup(point), aliases, ring)

    def node(self, node):
        if node.tags.get("place") not in PLACE_TYPES or not node.location.valid():
            return
        self.add_tags(node.tags, f"n:{node.id}", [node.location.lon, node.location.lat])

    def way(self, way):
        if not (way.tags.get("place") in PLACE_TYPES or way.tags.get("landuse") == "residential"):
            return
        if not any(way.tags.get(key) for key in ("name", "name:ar", "name:en")) or not way.is_closed():
            return
        coords = [[node.location.lon, node.location.lat] for node in way.nodes if node.location.valid()]
        if len(coords) != len(way.nodes) or not 4 <= len(coords) <= 1500:
            return
        # Keep the real outline. Derive a point inside it for indexing only.
        west, east = min(p[0] for p in coords), max(p[0] for p in coords)
        south, north = min(p[1] for p in coords), max(p[1] for p in coords)
        center = [(west + east) / 2, (south + north) / 2]
        point = center if contains(center, [coords]) else coords[0]
        self.add_tags(way.tags, f"w:{way.id}", point, coords)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("boundaries_zip", type=Path)
    parser.add_argument("osm_pbf", type=Path)
    parser.add_argument("workdir", type=Path, help="Empty directory on disk for SQLite and OSM node index")
    parser.add_argument("--export-only", action="store_true", help="Export a completed SQLite import")
    args = parser.parse_args()
    args.workdir.mkdir(exist_ok=True)
    if args.export_only:
        builder = Builder.__new__(Builder)
        builder.db = sqlite3.connect(args.workdir / "localities.sqlite")
        builder.omitted = {}
        builder.export([row[0] for row in builder.db.execute("SELECT DISTINCT parent FROM district ORDER BY parent")])
        return
    builder = Builder(args.workdir / "localities.sqlite")
    with ZipFile(args.boundaries_zip) as archive:
        governorates = [row["properties"]["adm1_pcode"] for row in source_features(archive, "admin1")]
        for district in source_features(archive, "admin2"):
            builder.add_district(district)
        builder.official(archive)
    builder.db.commit()
    Places(builder).apply_file(args.osm_pbf, locations=True, idx=f"sparse_file_array,{args.workdir / 'node-locations'}")
    builder.db.commit()
    builder.export(governorates)


if __name__ == "__main__":
    main()
