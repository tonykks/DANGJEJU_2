#!/usr/bin/env python3
"""Read-only diagnosis: users/*/favorites vs places existence. No writes."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

PROJECT = "dangjeju"
OUT = Path(__file__).resolve().parents[2] / "private_probe" / "favorites_orphan_diag" / "DIAGNOSIS.json"


def main() -> int:
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
    app = firebase_admin.initialize_app(cred, {"projectId": PROJECT}, name="fav-orphan-diag")
    db = firestore.client(app=app, database_id="(default)")

    report: dict = {
        "project": PROJECT,
        "mode": "read-only",
        "clientFilterNote": "App listFavorites keeps docs where data.placeId === doc.id",
        "drawerNote": "Drawer resolves via loadPlacesByIds; missing places omitted",
        "authEmailLookup": "skipped (ADC Identity Toolkit project mismatch); uid-only report",
        "users": [],
    }
    try:
        snaps = list(db.collection_group("favorites").stream(timeout=120))
        by_uid: dict[str, list] = {}
        for snap in snaps:
            parts = snap.reference.path.split("/")
            if len(parts) < 4 or parts[0] != "users" or parts[2] != "favorites":
                continue
            data = snap.to_dict() or {}
            by_uid.setdefault(parts[1], []).append({
                "docId": snap.id,
                "placeIdField": data.get("placeId"),
                "passesClientFilter": data.get("placeId") == snap.id,
                "keys": sorted(data.keys()),
            })

        all_ids = sorted({f["docId"] for favs in by_uid.values() for f in favs})
        exists: dict[str, bool] = {}
        refs = [db.document(f"places/{pid}") for pid in all_ids]
        for i in range(0, len(refs), 100):
            for snap in db.get_all(refs[i:i + 100], timeout=60):
                exists[snap.id] = snap.exists

        for uid, favs in sorted(by_uid.items(), key=lambda x: -len(x[1])):
            client_ids = [f["docId"] for f in favs if f["passesClientFilter"]]
            existing = [pid for pid in client_ids if exists.get(pid)]
            orphan = [pid for pid in client_ids if not exists.get(pid)]
            legacy = [pid for pid in client_ids if pid.startswith("place-")]
            kto = [pid for pid in client_ids if pid.startswith("kto-")]
            report["users"].append({
                "uid": uid,
                "favoriteDocCount": len(favs),
                "headerSavedPlaceIdsCount": len(client_ids),
                "drawerResolvedCount": len(existing),
                "headerMinusDrawer": len(client_ids) - len(existing),
                "allFavoriteDocIds": [f["docId"] for f in favs],
                "existingPlaceIds": existing,
                "orphanFavoriteIds_placeMissing": orphan,
                "legacyPlaceStarIds": legacy,
                "ktoIds": kto,
                "filterRejectedDocIds": [f["docId"] for f in favs if not f["passesClientFilter"]],
                "placeExistsMap": {f["docId"]: bool(exists.get(f["docId"])) for f in favs},
                "favorites": favs,
            })

        report["totalFavoriteDocs"] = len(snaps)
        report["status"] = "PASS"
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        summary = {
            "status": "PASS",
            "out": str(OUT),
            "totalFavoriteDocs": report["totalFavoriteDocs"],
            "users": [
                {
                    "uid": u["uid"],
                    "header": u["headerSavedPlaceIdsCount"],
                    "drawer": u["drawerResolvedCount"],
                    "orphanIds": u["orphanFavoriteIds_placeMissing"],
                    "allIds": u["allFavoriteDocIds"],
                }
                for u in report["users"]
            ],
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        text = f"{type(exc).__name__}: {exc}"
        report["status"] = "STOP_QUOTA" if any(t in text.lower() for t in ("resource_exhausted", "quota", "429")) else "ERROR"
        report["error"] = text
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False), file=sys.stderr)
        return 3 if report["status"] == "STOP_QUOTA" else 2
    finally:
        firebase_admin.delete_app(app)


if __name__ == "__main__":
    raise SystemExit(main())
