#!/usr/bin/env python3
"""Deterministic Place.search recompute: offline dry-run + gated live --apply.

Writes only places/{id}.search (+ updatedAt). Never creates listView.
Never mutates Source / KTO originals.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from derive import SEARCH_VERSION, SCORE_VERSION, derive_search

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "dangjeju"
DEFAULT_SNAPSHOT = ROOT / "private_probe" / "firestore_place_ui" / "catalog_before.json"
DEFAULT_OUT = ROOT / "private_probe" / "firestore_query_first" / "DRY_RUN_SEARCH_FIELDS.json"
DEFAULT_CHECKPOINT = ROOT / "private_probe" / "firestore_query_first" / "APPLY_CHECKPOINT.json"
BATCH_SIZE = 400


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


def build_rows(places, sources):
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
    return rows, regions, categories, tiers, heroes


def write_dry_run_report(args, actual, rows, regions, categories, tiers, heroes):
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


def is_quota_error(exc: BaseException) -> bool:
    text = f"{type(exc).__name__}: {exc}".lower()
    return any(tok in text for tok in (
        "resource_exhausted", "quota exceeded", "429", "rate limit", "too many requests",
    ))


def connect_firestore(app_name="place-search-recompute"):
    if "FIRESTORE_EMULATOR_HOST" in os.environ:
        raise SystemExit("Unset FIRESTORE_EMULATOR_HOST for live apply")
    if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
        raise SystemExit("Use gcloud ADC; unset GOOGLE_APPLICATION_CREDENTIALS")
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.oauth2 import service_account

    credential = credentials.ApplicationDefault()
    if isinstance(credential.get_credential(), service_account.Credentials):
        raise SystemExit("Service-account key credentials are prohibited")
    try:
        app = firebase_admin.get_app(app_name)
    except ValueError:
        app = firebase_admin.initialize_app(credential, {"projectId": PROJECT}, name=app_name)
    db = firestore.client(app=app, database_id="(default)")
    if db.project != PROJECT:
        raise SystemExit(f"Wrong project: {db.project}")
    return db, app, firestore


def load_checkpoint(path: Path) -> set[str]:
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    done = data.get("donePlaceIds") or []
    return set(done)


def save_checkpoint(path: Path, *, done: set[str], meta: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        **meta,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "doneCount": len(done),
        "donePlaceIds": sorted(done),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def apply_live(args, actual, rows, heroes):
    if args.confirm_project != PROJECT:
        print(
            f"REFUSING: pass --confirm-project={PROJECT} to enable live writes.",
            file=sys.stderr,
        )
        return 2

    db, app, firestore_mod = connect_firestore()
    done = load_checkpoint(args.checkpoint)
    pending = [r for r in rows if r["placeId"] not in done]
    written = skipped = missing = 0
    started = time.time()
    meta = {
        "mode": "apply",
        "project": PROJECT,
        "snapshot": str(args.snapshot),
        "snapshotSha256": actual,
        "searchVersion": SEARCH_VERSION,
        "scoreVersion": SCORE_VERSION,
        "totalPlaces": len(rows),
    }

    print(json.dumps({
        "status": "START",
        "pending": len(pending),
        "alreadyDone": len(done),
        "batchSize": BATCH_SIZE,
        "checkpoint": str(args.checkpoint),
    }, ensure_ascii=False))

    try:
        for i in range(0, len(pending), BATCH_SIZE):
            chunk = pending[i:i + BATCH_SIZE]
            refs = [db.document(f"places/{row['placeId']}") for row in chunk]
            try:
                snaps = list(db.get_all(refs, timeout=60))
            except Exception as exc:
                if is_quota_error(exc):
                    save_checkpoint(args.checkpoint, done=done, meta={**meta, "stopReason": "quota_on_read"})
                    print(json.dumps({
                        "status": "STOP_QUOTA",
                        "phase": "read",
                        "done": len(done),
                        "written": written,
                        "skipped": skipped,
                        "error": str(exc),
                    }, ensure_ascii=False), file=sys.stderr)
                    return 3
                raise

            by_id = {snap.id: snap for snap in snaps}
            batch = db.batch()
            to_write: list[str] = []
            chunk_skip: list[str] = []
            chunk_missing: list[str] = []
            for row in chunk:
                pid = row["placeId"]
                snap = by_id.get(pid)
                if snap is None or not snap.exists:
                    chunk_missing.append(pid)
                    continue
                current = snap.to_dict() or {}
                existing = current.get("search") if isinstance(current.get("search"), dict) else None
                if existing and existing.get("inputHash") == row["search"]["inputHash"]:
                    chunk_skip.append(pid)
                    continue
                payload = dict(row["search"])
                payload["derivedAt"] = firestore_mod.SERVER_TIMESTAMP
                batch.update(snap.reference, {
                    "search": payload,
                    "updatedAt": firestore_mod.SERVER_TIMESTAMP,
                })
                to_write.append(pid)

            if to_write:
                try:
                    batch.commit(timeout=60)
                except Exception as exc:
                    if is_quota_error(exc):
                        save_checkpoint(args.checkpoint, done=done, meta={**meta, "stopReason": "quota_on_write"})
                        print(json.dumps({
                            "status": "STOP_QUOTA",
                            "phase": "write",
                            "done": len(done),
                            "written": written,
                            "skipped": skipped,
                            "error": str(exc),
                        }, ensure_ascii=False), file=sys.stderr)
                        return 3
                    raise

            for pid in chunk_missing:
                missing += 1
                done.add(pid)
            for pid in chunk_skip:
                skipped += 1
                done.add(pid)
            for pid in to_write:
                written += 1
                done.add(pid)

            save_checkpoint(args.checkpoint, done=done, meta={
                **meta,
                "written": written,
                "skipped": skipped,
                "missing": missing,
            })
            print(json.dumps({
                "status": "PROGRESS",
                "done": len(done),
                "written": written,
                "skipped": skipped,
                "missing": missing,
                "elapsedSec": round(time.time() - started, 1),
            }, ensure_ascii=False))

        # Light verify: count places with search.version==1 via aggregation if available
        verify = {"heroPreview": [
            {"placeId": pid, "name": name, "totalScore": score}
            for score, pid, name, _ in heroes[:5]
        ]}
        try:
            q = (
                db.collection("places")
                .where("search.version", "==", SEARCH_VERSION)
                .count()
            )
            verify["placesWithSearchVersion1"] = q.get(timeout=45)[0][0].value
        except Exception as exc:
            verify["placesWithSearchVersion1"] = None
            verify["countError"] = str(exc)

        save_checkpoint(args.checkpoint, done=done, meta={
            **meta,
            "status": "PASS",
            "written": written,
            "skipped": skipped,
            "missing": missing,
            "verify": verify,
        })
        print(json.dumps({
            "status": "PASS",
            "written": written,
            "skipped": skipped,
            "missing": missing,
            "done": len(done),
            "verify": verify,
            "elapsedSec": round(time.time() - started, 1),
            "checkpoint": str(args.checkpoint),
        }, ensure_ascii=False))
        return 0 if missing == 0 else 4
    finally:
        import firebase_admin
        try:
            firebase_admin.delete_app(app)
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Recompute Place.search fields (deterministic)")
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--dry-run", action="store_true", help="Offline report only (default if --apply omitted)")
    parser.add_argument("--apply", action="store_true", help="Live Firestore search-only update")
    parser.add_argument("--confirm-project", default="", help=f"Must be {PROJECT} for --apply")
    parser.add_argument("--expected-sha256", default="2b91c56fc7b5196bc828c9238081678ed31b26a21a318ac516580238a40ca35b")
    args = parser.parse_args()

    actual = sha256_file(args.snapshot)
    if args.expected_sha256 and actual != args.expected_sha256:
        raise SystemExit(f"snapshot sha mismatch: {actual}")

    places, sources = load_snapshot(args.snapshot)
    rows, regions, categories, tiers, heroes = build_rows(places, sources)

    if args.apply:
        return apply_live(args, actual, rows, heroes)

    return write_dry_run_report(args, actual, rows, regions, categories, tiers, heroes)


if __name__ == "__main__":
    raise SystemExit(main())
