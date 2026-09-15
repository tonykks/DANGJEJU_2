#!/usr/bin/env python3
"""Admin ADC live smoke for Query-first search fields. No retry storm on quota."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

PROJECT = "dangjeju"
OUT = Path(__file__).resolve().parents[2] / "private_probe" / "firestore_query_first" / "LIVE_SMOKE.json"


def main() -> int:
    if "FIRESTORE_EMULATOR_HOST" in os.environ:
        raise SystemExit("Unset FIRESTORE_EMULATOR_HOST")
    if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
        raise SystemExit("Unset GOOGLE_APPLICATION_CREDENTIALS; use ADC")

    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.cloud.firestore_v1.base_query import FieldFilter
    from google.oauth2 import service_account

    cred = credentials.ApplicationDefault()
    if isinstance(cred.get_credential(), service_account.Credentials):
        raise SystemExit("Service-account key credentials prohibited")
    app = firebase_admin.initialize_app(cred, {"projectId": PROJECT}, name="qf-smoke")
    db = firestore.client(app=app, database_id="(default)")

    report: dict = {"project": PROJECT, "checks": {}}
    try:
        version_count = (
            db.collection("places")
            .where(filter=FieldFilter("search.version", "==", 1))
            .count()
            .get(timeout=45)[0][0]
            .value
        )
        report["checks"]["searchVersion1Count"] = version_count

        hero_snaps = list(
            db.collection("places")
            .where(filter=FieldFilter("search.version", "==", 1))
            .where(filter=FieldFilter("search.totalScore", ">=", 12))
            .order_by("search.totalScore", direction=firestore.Query.DESCENDING)
            .limit(5)
            .stream(timeout=45)
        )
        report["checks"]["hero"] = [
            {
                "id": s.id,
                "name": (s.to_dict() or {}).get("name"),
                "totalScore": ((s.to_dict() or {}).get("search") or {}).get("totalScore"),
                "region": ((s.to_dict() or {}).get("search") or {}).get("region"),
                "category": ((s.to_dict() or {}).get("search") or {}).get("category"),
            }
            for s in hero_snaps
        ]

        search_snaps = list(
            db.collection("places")
            .where(filter=FieldFilter("search.version", "==", 1))
            .where(filter=FieldFilter("search.region", "==", "WEST"))
            .where(filter=FieldFilter("search.category", "==", "CAFE"))
            .order_by("search.petSortKey", direction=firestore.Query.DESCENDING)
            .limit(10)
            .stream(timeout=45)
        )
        report["checks"]["westCafeSample"] = [
            {
                "id": s.id,
                "name": (s.to_dict() or {}).get("name"),
                "petTier": ((s.to_dict() or {}).get("search") or {}).get("petTier"),
                "petSortKey": ((s.to_dict() or {}).get("search") or {}).get("petSortKey"),
            }
            for s in search_snaps
        ]
        report["checks"]["westCafeCountApprox"] = len(search_snaps)

        fav_id = "kto-3401751"
        fav = db.document(f"places/{fav_id}").get(timeout=30)
        report["checks"]["favoriteResolve"] = {
            "id": fav_id,
            "exists": fav.exists,
            "hasSearch": bool((fav.to_dict() or {}).get("search")),
        }

        ok = (
            version_count == 2126
            and len(hero_snaps) == 5
            and all(h["totalScore"] >= 12 for h in report["checks"]["hero"])
            and len(search_snaps) > 0
            and fav.exists
        )
        report["status"] = "PASS" if ok else "FAIL"
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"status": report["status"], "out": str(OUT),
                          "versionCount": version_count,
                          "hero": len(hero_snaps),
                          "westCafeSample": len(search_snaps)}, ensure_ascii=False))
        return 0 if ok else 1
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
