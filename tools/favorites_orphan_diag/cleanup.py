#!/usr/bin/env python3
"""Favorites orphan scan/cleanup. Default is read-only; --apply deletes orphans only.

Orphan = favorite doc whose places/{placeId} does not exist.
Never touches favorites whose place document exists.
Does not modify app source.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT = "dangjeju"
OUT_DIR = Path(__file__).resolve().parents[2] / "private_probe" / "favorites_orphan_diag"


def connect():
    if "FIRESTORE_EMULATOR_HOST" in os.environ:
        raise SystemExit("Unset FIRESTORE_EMULATOR_HOST")
    if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
        raise SystemExit("Unset GOOGLE_APPLICATION_CREDENTIALS; use ADC")
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.oauth2 import service_account

    cred = credentials.ApplicationDefault()
    if isinstance(cred.get_credential(), service_account.Credentials):
        raise SystemExit("Service-account key credentials prohibited")
    app = firebase_admin.initialize_app(cred, {"projectId": PROJECT}, name="fav-orphan-cleanup")
    db = firestore.client(app=app, database_id="(default)")
    return db, app, firestore


def scan(db) -> dict:
    snaps = list(db.collection_group("favorites").stream(timeout=120))
    rows = []
    for snap in snaps:
        parts = snap.reference.path.split("/")
        if len(parts) < 4 or parts[0] != "users" or parts[2] != "favorites":
            continue
        data = snap.to_dict() or {}
        place_id = data.get("placeId") if isinstance(data.get("placeId"), str) else snap.id
        # Prefer field when it matches doc id (app filter); still check doc id existence.
        check_id = snap.id
        rows.append({
            "path": snap.reference.path,
            "uid": parts[1],
            "docId": snap.id,
            "placeIdField": data.get("placeId"),
            "checkPlaceId": check_id,
            "passesClientFilter": data.get("placeId") == snap.id,
        })

    ids = sorted({r["checkPlaceId"] for r in rows})
    exists: dict[str, bool] = {}
    refs = [db.document(f"places/{pid}") for pid in ids]
    for i in range(0, len(refs), 100):
        for snap in db.get_all(refs[i:i + 100], timeout=60):
            exists[snap.id] = snap.exists

    for r in rows:
        r["placeExists"] = bool(exists.get(r["checkPlaceId"]))
        r["orphan"] = not r["placeExists"]

    orphans = [r for r in rows if r["orphan"]]
    keep = [r for r in rows if not r["orphan"]]
    by_uid: dict[str, dict] = {}
    for r in rows:
        u = by_uid.setdefault(r["uid"], {
            "uid": r["uid"],
            "total": 0,
            "headerIds": 0,
            "existing": 0,
            "orphan": 0,
            "orphanPaths": [],
            "keepIds": [],
        })
        u["total"] += 1
        if r["passesClientFilter"]:
            u["headerIds"] += 1
        if r["orphan"]:
            u["orphan"] += 1
            u["orphanPaths"].append(r["path"])
        else:
            u["existing"] += 1
            u["keepIds"].append(r["docId"])

    return {
        "scannedAt": datetime.now(timezone.utc).isoformat(),
        "totalFavoriteDocs": len(rows),
        "orphanCount": len(orphans),
        "keepCount": len(keep),
        "orphans": orphans,
        "keeps": keep,
        "byUid": list(by_uid.values()),
    }


def apply_delete(db, orphans: list[dict]) -> dict:
    deleted = []
    failed = []
    for r in orphans:
        # Safety: never delete if place now exists
        place = db.document(f"places/{r['checkPlaceId']}").get(timeout=30)
        if place.exists:
            failed.append({**r, "error": "place_now_exists_skip"})
            continue
        try:
            db.document(r["path"]).delete(timeout=30)
            deleted.append(r["path"])
        except Exception as exc:
            failed.append({**r, "error": f"{type(exc).__name__}: {exc}"})
    return {"deletedCount": len(deleted), "deletedPaths": deleted, "failed": failed}


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan/delete orphan favorites (missing places)")
    parser.add_argument("--apply", action="store_true", help="Delete confirmed orphans")
    parser.add_argument("--confirm-project", default="", help=f"Must be {PROJECT} with --apply")
    args = parser.parse_args()

    db, app, _ = connect()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        before = scan(db)
        (OUT_DIR / "CLEANUP_SCAN_BEFORE.json").write_text(
            json.dumps(before, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(json.dumps({
            "phase": "scan_before",
            "total": before["totalFavoriteDocs"],
            "orphans": before["orphanCount"],
            "orphanPaths": [o["path"] for o in before["orphans"]],
            "byUid": [
                {
                    "uid": u["uid"],
                    "total": u["total"],
                    "headerIds": u["headerIds"],
                    "existing": u["existing"],
                    "orphan": u["orphan"],
                    "orphanPaths": u["orphanPaths"],
                    "keepIds": u["keepIds"],
                }
                for u in before["byUid"]
            ],
        }, ensure_ascii=False, indent=2))

        if not args.apply:
            print(json.dumps({"status": "SCAN_ONLY", "hint": f"--apply --confirm-project={PROJECT}"}, ensure_ascii=False))
            return 0

        if args.confirm_project != PROJECT:
            print(json.dumps({"status": "REFUSED", "reason": f"pass --confirm-project={PROJECT}"}, ensure_ascii=False), file=sys.stderr)
            return 2

        result = apply_delete(db, before["orphans"])
        after = scan(db)
        (OUT_DIR / "CLEANUP_SCAN_AFTER.json").write_text(
            json.dumps({"delete": result, "after": after}, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        ok = after["orphanCount"] == 0 and not result["failed"]
        print(json.dumps({
            "status": "PASS" if ok else "FAIL",
            "deletedCount": result["deletedCount"],
            "deletedPaths": result["deletedPaths"],
            "failed": result["failed"],
            "afterOrphanCount": after["orphanCount"],
            "afterTotal": after["totalFavoriteDocs"],
            "afterByUid": [
                {
                    "uid": u["uid"],
                    "total": u["total"],
                    "headerIds": u["headerIds"],
                    "existing": u["existing"],
                    "orphan": u["orphan"],
                    "keepIds": u["keepIds"],
                }
                for u in after["byUid"]
            ],
        }, ensure_ascii=False, indent=2))
        return 0 if ok else 1
    finally:
        import firebase_admin
        firebase_admin.delete_app(app)


if __name__ == "__main__":
    raise SystemExit(main())
