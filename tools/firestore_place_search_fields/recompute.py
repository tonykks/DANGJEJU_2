#!/usr/bin/env python3
"""Offline dry-run / report for Place.search recompute. Live --apply is gated."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

from derive import SEARCH_VERSION, SCORE_VERSION, derive_search

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SNAPSHOT = ROOT / "private_probe" / "firestore_place_ui" / "catalog_before.json"
DEFAULT_OUT = ROOT / "private_probe" / "firestore_query_first" / "DRY_RUN_SEARCH_FIELDS.json"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_snapshot(path: Path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    places = {p["id"]: p for p in data["places"]}
    sources = {}
    for s in data["sources"]:
        pid = s["data"]["placeId"]
        if pid in sources:
            raise SystemExit(f"duplicate source for {pid}")
        sources[pid] = s
    if len(places) != 2126 or len(sources) != 2126:
        raise SystemExit(f"unexpected counts places={len(places)} sources={len(sources)}")
    return places, sources


def main():
    parser = argparse.ArgumentParser(description="Recompute Place.search fields (deterministic)")
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply", action="store_true", help="Live Firestore write (requires explicit flag; default off)")
    parser.add_argument("--expected-sha256", default="2b91c56fc7b5196bc828c9238081678ed31b26a21a318ac516580238a40ca35b")
    args = parser.parse_args()

    if args.apply:
        print("REFUSING: --apply is gated until Owner/Toby approve live backfill.", file=sys.stderr)
        print("Run without --apply for offline dry-run.", file=sys.stderr)
        return 2

    actual = sha256_file(args.snapshot)
    if args.expected_sha256 and actual != args.expected_sha256:
        raise SystemExit(f"snapshot sha mismatch: {actual}")

    places, sources = load_snapshot(args.snapshot)
    rows = []
    regions = Counter()
    categories = Counter()
    tiers = Counter()
    heroes = []
    for place_id, place_doc in places.items():
        source_doc = sources[place_id]
        search = derive_search(place_doc["data"], {**source_doc["data"], "id": source_doc["id"]})
        rows.append({"placeId": place_id, "search": search})
        regions[search["region"]] += 1
        categories[search["category"]] += 1
        tiers[search["petTier"]] += 1
        if search["totalScore"] >= 12:
            heroes.append((search["totalScore"], place_id, place_doc["data"].get("name"), search))

    heroes.sort(key=lambda x: (-x[0], x[1]))
    report = {
        "mode": "dry-run",
        "snapshot": str(args.snapshot),
        "snapshotSha256": actual,
        "searchVersion": SEARCH_VERSION,
        "scoreVersion": SCORE_VERSION,
        "places": len(rows),
        "regions": dict(regions),
        "categories": dict(categories),
        "tiers": dict(tiers),
        "heroCandidates": [
            {"placeId": pid, "name": name, "totalScore": score, "petTier": search["petTier"],
             "region": search["region"], "category": search["category"]}
            for score, pid, name, search in heroes
        ],
        "heroLimitPreview": [
            {"placeId": pid, "name": name, "totalScore": score}
            for score, pid, name, search in heroes[:5]
        ],
        "unknownRegion": regions.get("UNKNOWN", 0),
        "unknownCategory": categories.get("UNKNOWN", 0),
        "sample": rows[0] if rows else None,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # Optional CSV for Owner
    csv_path = args.out.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "placeId", "region", "category", "basicScore", "petScore", "totalScore",
            "petTier", "petSortKey", "primarySourceId", "inputHash",
        ])
        w.writeheader()
        for row in sorted(rows, key=lambda r: (-r["search"]["petSortKey"], r["placeId"])):
            s = row["search"]
            w.writerow({
                "placeId": row["placeId"],
                "region": s["region"], "category": s["category"],
                "basicScore": s["basicScore"], "petScore": s["petScore"], "totalScore": s["totalScore"],
                "petTier": s["petTier"], "petSortKey": s["petSortKey"],
                "primarySourceId": s["primarySourceId"], "inputHash": s["inputHash"],
            })

    print(json.dumps({
        "status": "PASS",
        "places": report["places"],
        "heroes": len(heroes),
        "heroLimitPreview": report["heroLimitPreview"],
        "regions": report["regions"],
        "categories": report["categories"],
        "tiers": report["tiers"],
        "out": str(args.out),
        "csv": str(csv_path),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
