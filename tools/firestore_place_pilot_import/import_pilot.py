"""Bounded, ADC-only Stage 1 importer. No application/client dependencies."""

import argparse
from collections import Counter
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "dangjeju"
CSV_PATH = Path("private_probe/20260911T143232Z/tables/jeju_pet_join.csv")
CSV_SHA256 = "40347183f4889863b6d4fdbf46a47b7a8bd77835410e06f76d3e50e99863ec3b"
RAW_DIR = ROOT / "private_probe/20260911T143232Z/raw"
OUTPUT = ROOT / "private_probe/firestore_place_pilot_import"
MANIFEST = OUTPUT / "PILOT_MANIFEST.json"
PILOT_SIZE = 20
# Frozen after selection: required samples, then underrepresented type and city,
# followed by city/type pair and numeric contentId as deterministic tie breakers.
PILOT_IDS = (
    "3401751", "2626708", "3371999", "4026831", "2704351", "3307106",
    "126441", "130474", "2609373", "126450", "129894", "2621853",
    "129767", "131103", "132159", "133258", "136453", "141736",
    "129895", "131269",
)
SAMPLE_REASONS = {
    "3401751": "Schema 8.1: cafe; preserve all nine pet observations without policy inference.",
    "2626708": "Schema 8.2: lodging; addr1 only; partial-area label is not indoor permission.",
    "3371999": "Schema 8.3: UNKNOWN tourism record; retain separately from 4026831.",
    "4026831": "Schema 8.3: overlay shopping record; retain separately from 3371999.",
    "2704351": "Schema 8.4: preserve anomalous longitude 12.79737228191.",
    "3307106": "Schema 8.5: CU shopping overlay; no inferred cafe category or permission.",
}
PET_FIELDS = (
    "acmpyTypeCd", "acmpyNeedMtr", "acmpyPsblCpam", "etcAcmpyInfo",
    "relaAcdntRiskMtr", "relaFrnshPrdlst", "relaPosesFclty",
    "relaPurcPrdlst", "relaRntlPrdlst",
)
PET_TRI = (
    "petAcceptance", "smallDogAllowed", "mediumDogAllowed", "largeDogAllowed",
    "indoorAllowed", "outdoorAllowed", "carrierRequired", "leashRequired",
    "offLeashZoneAvailable",
)
PET_NULL = (
    "allowedBreeds", "allowedSizes", "sizeDescription", "spacePolicy",
    "spaceDescription", "leashDescription", "petFee", "petFeeDescription",
    "otherPetPolicy",
)
AMENITY_TRI = (
    "freeParking", "dogMenu", "waterBowlProvided", "wasteBagsProvided",
    "fencedYard", "photoZone",
)
KTO_COLUMNS = {
    "contentId": "contentid", "title": "title", "addr1": "addr1",
    "addr2": "addr2", "areaCode": "areacode", "cat1": "cat1",
    "cat2": "cat2", "cat3": "cat3", "contentTypeId": "contenttypeid",
    "contentTypeName": "contenttype_name", "copyrightDivisionCode": "cpyrhtDivCd",
    "firstImage": "firstimage", "firstImage2": "firstimage2",
    "lDongRegnCd": "lDongRegnCd", "lDongSignguCd": "lDongSignguCd",
    "sigunguCode": "sigungucode", "tel": "tel", "zipcode": "zipcode",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=lambda v: v.isoformat())


def digest(value):
    return hashlib.sha256(dumps(value).encode("utf-8")).hexdigest()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_or_null(value):
    return value if value.strip() else None


def source_time(value):
    # KTO's timezone-less 14-digit strings are retained separately, too.
    if not value:
        return None
    return datetime.strptime(value, "%Y%m%d%H%M%S").replace(
        tzinfo=timezone(timedelta(hours=9))
    ).astimezone(timezone.utc)


def coordinate(value):
    if not value.strip():
        return None
    parsed = float(value)
    require(math.isfinite(parsed), "Non-finite coordinate in source")
    return parsed


def coordinate_quality(latitude, longitude):
    if latitude is None or longitude is None:
        return "MISSING"
    # Broad Jeju including Chuja/Marado; QA heuristic, not an administrative boundary.
    return "OK" if 32.5 <= latitude <= 34.2 and 125.5 <= longitude <= 127.2 else "SOURCE_ANOMALY"


def load_rows():
    require(sha256(ROOT / CSV_PATH) == CSV_SHA256, "Source CSV checksum changed; refusing import")
    rows = {}
    with (ROOT / CSV_PATH).open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        require(len(reader.fieldnames) == len(set(reader.fieldnames)), "Duplicate CSV headers")
        previous_line = reader.line_num
        for record_number, row in enumerate(reader, start=1):
            require(None not in row and None not in row.values(), "Malformed CSV row")
            content_id = row["contentid"]
            require(re.fullmatch(r"[0-9]+", content_id) is not None, "Invalid contentId")
            require(content_id not in rows, "Duplicate contentId; automatic merge prohibited")
            require(row["has_pet"] in ("Y", "N"), "Invalid has_pet")
            require(row["lDongRegnCd"] == "50" and row["lDongSignguCd"] in ("110", "130"), "Unexpected region")
            require(row["source"] == "areaBasedList2", "Unexpected collector source")
            require(bool(row["pet_acmpyTypeCd"]) == (row["has_pet"] == "Y"), "JOIN status/overlay conflict")
            if row["has_pet"] == "N":
                require(not any(row["pet_" + key] for key in PET_FIELDS), "Pet fields on UNKNOWN row")
            rows[content_id] = {
                "row": row, "csvRecord": record_number,
                "physicalLineStart": previous_line + 1, "physicalLineEnd": reader.line_num,
            }
            previous_line = reader.line_num
    require(bool(rows), "Source CSV is empty")
    return rows


def load_supplement(selected_ids):
    result = {}
    for path in sorted(RAW_DIR.glob("areaBasedList2_ldong50_p*.json")):
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
        raw_sha256 = sha256(path)
        require(raw["response"]["header"]["resultCode"] == "0000", "Failed raw API response")
        for index, item in enumerate(raw["response"]["body"]["items"]["item"]):
            cid = str(item["contentid"])
            if cid in selected_ids:
                require(cid not in result, "Duplicate selected contentId in raw files")
                result[cid] = (item, {
                    "path": path.relative_to(ROOT).as_posix(), "sha256": raw_sha256,
                    "jsonPointer": f"/response/body/items/item/{index}",
                })
    require(set(result) == set(selected_ids), "Raw supplement missing for selected place")
    return result


def build_plan(*, full=False):
    if not full:
        require(len(PILOT_IDS) == PILOT_SIZE and len(set(PILOT_IDS)) == PILOT_SIZE, "Pilot must contain exactly 20 unique IDs")
    rows = load_rows()
    selected_ids = sorted(rows, key=int) if full else PILOT_IDS
    supplemental = load_supplement(set(selected_ids))
    entries, documents = [], {}
    for cid in selected_ids:
        metadata = rows[cid]
        row = metadata["row"]
        raw, raw_ref = supplemental[cid]
        for key, value in row.items():
            if key in raw:
                require(value == raw[key], f"CSV/raw mismatch for {cid}: {key}")
        status = "KTO_OVERLAY_FOUND" if row["has_pet"] == "Y" else "UNKNOWN"
        place_id = f"kto-{cid}"
        source_id = f"kto-areaBasedList2-{cid}"
        place_path = f"places/{place_id}"
        source_path = f"{place_path}/sources/{source_id}"
        entry = {
            "contentId": cid, "name": row["title"], "has_pet": row["has_pet"],
            "petInformationStatus": status, "lDongSignguCd": row["lDongSignguCd"],
            "contentTypeId": row["contenttypeid"], "placePath": place_path,
            "sourcePath": source_path,
            "reason": "Every source CSV record; no name/address merge." if full else SAMPLE_REASONS.get(cid, "Diversify underrepresented content type, city, and city/type pair; numeric contentId tie breaker."),
            **{k: metadata[k] for k in ("csvRecord", "physicalLineStart", "physicalLineEnd")},
            "supplementalRawReference": raw_ref,
        }
        entries.append(entry)
        latitude, longitude = coordinate(row["mapy"]), coordinate(row["mapx"])
        place = {key: None for key in (
            "serviceCategory", "regionName", "shortDescription", "fullDescription",
            "roadAddress", "parkingInfo", "businessHours", "closedDays", "instagramUrl",
            "tags", "recommendedPoints", "cautionNotes", "placeGroupId", "parentPlaceId",
            "relatedPlaceIds", "extraAttributes",
        )}
        place.update({
            "placeId": place_id, "name": row["title"], "address": row["addr1"],
            "municipality": {"110": "JEJU_CITY", "130": "SEOGWIPO_CITY"}[row["lDongSignguCd"]],
            "regionArea": "UNKNOWN", "latitude": latitude, "longitude": longitude,
            "coordinateQualityStatus": coordinate_quality(latitude, longitude),
            "phone": text_or_null(row["tel"]), "primaryImageUrl": text_or_null(row["firstimage"]),
            "secondaryImageUrl": text_or_null(row["firstimage2"]), "publicationStatus": "DRAFT",
            "petPolicy": {"petInformationStatus": status, **dict.fromkeys(PET_TRI, "UNKNOWN"), **dict.fromkeys(PET_NULL)},
            "amenities": {**dict.fromkeys(AMENITY_TRI, "UNKNOWN"), "parkingDescription": None},
        })
        # Empty strings in the source are intentional: only service text becomes null.
        kto = {target: row[column] for target, column in KTO_COLUMNS.items()}
        kto.update({key: raw[key] for key in ("lclsSystm1", "lclsSystm2", "lclsSystm3")})
        kto.update({
            "mapLevel": int(raw["mlevel"]) if raw["mlevel"] else None,
            "mapx": longitude, "mapy": latitude,
            "mapxText": row["mapx"], "mapyText": row["mapy"],
            "createdTime": source_time(row["createdtime"]), "modifiedTime": source_time(row["modifiedtime"]),
            "createdTimeText": row["createdtime"], "modifiedTimeText": row["modifiedtime"],
            "pet": {key: row["pet_" + key] for key in PET_FIELDS} if row["has_pet"] == "Y" else None,
        })
        source = {
            "placeSourceId": source_id, "placeId": place_id, "source": "KTO",
            "sourceDataset": "areaBasedList2+detailPetTour2" if row["has_pet"] == "Y" else "areaBasedList2",
            "sourceId": cid, "sourceUpdatedAt": source_time(row["modifiedtime"]),
            "verifiedAt": None, "verificationStatus": "UNVERIFIED",
            "rawReference": f"{CSV_PATH.as_posix()}#record={entry['csvRecord']}&lines={entry['physicalLineStart']}-{entry['physicalLineEnd']}&contentid={cid}&sha256={CSV_SHA256}",
            "supplementalRawReference": f"{raw_ref['path']}#{raw_ref['jsonPointer']}?sha256={raw_ref['sha256']}",
            "sourceTimestampTimezoneAssumption": "Asia/Seoul (UTC+09:00)",
            "collector": {"hasPetJoin": row["has_pet"], "sourceLabel": row["source"]},
            "kto": kto,
        }
        documents[place_path], documents[source_path] = place, source
    summary = {
        "places": len(entries), "sources": len(entries), "documents": len(documents),
        "petKnown": sum(e["has_pet"] == "Y" for e in entries),
        "petUnknown": sum(e["has_pet"] == "N" for e in entries),
        "cities": dict(sorted(Counter(e["lDongSignguCd"] for e in entries).items())),
        "contentTypes": dict(sorted(Counter(e["contentTypeId"] for e in entries).items())),
    }
    if not full:
        require(summary["petKnown"] == summary["petUnknown"] == 10, "Expected 10 known and 10 UNKNOWN")
        require(summary["cities"] == {"110": 10, "130": 10}, "Expected balanced cities")
        require(set(summary["contentTypes"]) == {"12", "14", "15", "28", "32", "38", "39"}, "Expected all seven types")
    manifest = {
        "schemaVersion": 1, "pilot": "DANGJEJU_2 Firestore Place DB Stage 1",
        "projectId": PROJECT, "databaseId": "(default)",
        "sourceCsv": CSV_PATH.as_posix(), "sourceCsvSha256": CSV_SHA256,
        "sourceRows": len(rows), "selectionFrozen": True,
        "idPolicy": "Pilot-only deterministic placeId=kto-{contentId}; placeId and sourceId remain distinct concepts.",
        "summary": summary, "places": entries, "payloadSha256": digest(documents),
    }
    if full:
        manifest.pop("pilot")
        manifest["import"] = "DANGJEJU_2 Firestore Place DB Stage 2 Full"
        manifest["idPolicy"] = "Deterministic placeId=kto-{contentId}; one separate Place per CSV contentId."
    return manifest, documents


def stable_document(path, document):
    temporal = {"importedAt"} if "/sources/" in path else {"createdAt", "updatedAt"}
    return {key: value for key, value in document.items() if key not in temporal}


def validate_existing(path, current, expected):
    if current is not None:
        require(stable_document(path, current) == expected,
                f"Existing document differs from frozen payload: {path}. No overwrite performed.")
        fields = ("importedAt",) if "/sources/" in path else ("createdAt", "updatedAt")
        require(all(isinstance(current.get(k), datetime) for k in fields), f"Existing timestamp missing: {path}")


def connect(*, app_name="place-stage1-pilot"):
    require("FIRESTORE_EMULATOR_HOST" not in os.environ, "Unset FIRESTORE_EMULATOR_HOST for this live import")
    require("GOOGLE_APPLICATION_CREDENTIALS" not in os.environ, "Use existing gcloud ADC, not a credentials file override")
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.oauth2 import service_account

    credential = credentials.ApplicationDefault()
    require(not isinstance(credential.get_credential(), service_account.Credentials), "Service-account key credentials are prohibited")
    app = firebase_admin.initialize_app(credential, {"projectId": PROJECT}, name=app_name)
    db = firestore.client(app=app, database_id="(default)")
    require(db.project == PROJECT, "Wrong project")
    return db, app, firestore


def inventory(db, documents, favorites):
    snapshots = {s.reference.path: s for s in db.get_all([db.document(p) for p in documents], timeout=45)}
    require(set(snapshots) == set(documents), "Incomplete document read")
    source_paths = sorted(
        s.reference.path
        for path in documents if "/sources/" not in path
        for s in db.document(path).collection("sources").select([]).stream(timeout=45)
    )
    return {
        "placesTotal": db.collection("places").count().get(timeout=45)[0][0].value,
        "pilotPlaces": sum(s.exists for p, s in snapshots.items() if "/sources/" not in p),
        "pilotSources": sum(s.exists for p, s in snapshots.items() if "/sources/" in p),
        "sourcesUnderPilotPlaces": len(source_paths), "sourcePaths": source_paths,
        "favoritesTotal": db.collection_group("favorites").count().get(timeout=45)[0][0].value if favorites else None,
    }, snapshots


def upsert_transaction(db, firestore, documents):
    @firestore.transactional
    def write(transaction):
        snapshots = {s.reference.path: s for s in db.get_all(
            [db.document(p) for p in documents], transaction=transaction, timeout=45
        )}
        require(set(snapshots) == set(documents), "Incomplete transactional read")
        # Validate every collision before scheduling any write; the transaction is atomic.
        for path, expected in documents.items():
            validate_existing(path, snapshots[path].to_dict(), expected)
        new_places = new_sources = 0
        for path, expected in documents.items():
            require(re.fullmatch(r"places/kto-[0-9]+(?:/sources/kto-areaBasedList2-[0-9]+)?", path), "Disallowed write path")
            current = snapshots[path].to_dict()
            payload = dict(expected)
            if "/sources/" in path:
                payload["importedAt"] = firestore.SERVER_TIMESTAMP
                new_sources += current is None
            else:
                payload["createdAt"] = current["createdAt"] if current else firestore.SERVER_TIMESTAMP
                payload["updatedAt"] = firestore.SERVER_TIMESTAMP
                new_places += current is None
            transaction.set(db.document(path), payload, merge=True)
        return {"createdPlaces": new_places, "createdSources": new_sources, "setOperations": len(documents)}

    return write(db.transaction(max_attempts=3))


def verify_documents(snapshots, documents):
    for path, expected in documents.items():
        require(snapshots[path].exists, f"Missing imported document: {path}")
        validate_existing(path, snapshots[path].to_dict(), expected)
    return digest({p: stable_document(p, s.to_dict()) for p, s in snapshots.items()})


def write_report(name, report):
    require(re.fullmatch(r"[A-Za-z0-9_-]+\.json", name), "Report name must be a simple .json filename")
    require(name != MANIFEST.name, "Report cannot overwrite manifest")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # Preserve evidence of previous runs instead of silently replacing it.
    with (OUTPUT / name).open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(report, ensure_ascii=False, indent=2, default=lambda v: v.isoformat()) + "\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Offline validation and selection log; no SDK/ADC needed")
    mode.add_argument("--apply", action="store_true", help="Write the frozen 20-place pilot to dangjeju using ADC")
    mode.add_argument("--verify", action="store_true", help="Read-only verification against the frozen payload")
    parser.add_argument("--write-manifest", action="store_true", help="Only with dry-run; create the manifest if absent")
    parser.add_argument("--favorites-count", action="store_true", help="Read-only collection-group count before/after")
    parser.add_argument("--report-name", help="New JSON filename under private_probe/firestore_place_pilot_import")
    args = parser.parse_args(argv)
    require(not args.write_manifest or args.dry_run, "--write-manifest requires --dry-run")
    report_name = args.report_name or ("RUN_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json")
    require(re.fullmatch(r"[A-Za-z0-9_-]+\.json", report_name) and report_name != MANIFEST.name, "Invalid report name")
    require(not (OUTPUT / report_name).exists(), "Report exists; choose a new report name before any writes")
    manifest, documents = build_plan()
    if MANIFEST.exists():
        require(json.loads(MANIFEST.read_text(encoding="utf-8")) == manifest, "Manifest drift; refusing import")
    elif args.write_manifest:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        with MANIFEST.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    else:
        require(args.dry_run, "First create and review the manifest using --dry-run --write-manifest")
    report = {
        "startedAt": datetime.now(timezone.utc), "mode": "dry-run" if args.dry_run else "apply" if args.apply else "verify",
        "projectId": PROJECT, "databaseId": "(default)", "manifestSha256": digest(manifest),
        "payloadSha256": manifest["payloadSha256"], "selection": manifest["summary"],
    }
    if args.dry_run:
        for entry in manifest["places"]:
            print("SELECT " + dumps(entry), flush=True)
    print("PLAN " + dumps(manifest["summary"]), flush=True)
    if args.dry_run:
        report.update({"status": "PASS", "setOperations": 0, "documents": documents})
        write_report(report_name, report)
        print("HANK_PILOT_DRY_RUN " + dumps(manifest["summary"]), flush=True)
        return 0
    db, app, firestore = connect()
    import firebase_admin
    try:
        before, before_snapshots = inventory(db, documents, args.favorites_count)
        report["before"] = before
        print("BEFORE " + dumps(before), flush=True)
        if args.apply:
            report["writes"] = upsert_transaction(db, firestore, documents)
            print("COMMITTED " + dumps(report["writes"]), flush=True)
            after, after_snapshots = inventory(db, documents, args.favorites_count)
        else:
            report["writes"] = {"createdPlaces": 0, "createdSources": 0, "setOperations": 0}
            after, after_snapshots = before, before_snapshots
        report["after"] = after
        report["readbackPayloadSha256"] = verify_documents(after_snapshots, documents)
        require(report["readbackPayloadSha256"] == manifest["payloadSha256"], "Readback digest mismatch")
        require(after["pilotPlaces"] == after["pilotSources"] == PILOT_SIZE, "Unexpected pilot counts")
        if args.apply:
            require(after["placesTotal"] - before["placesTotal"] == report["writes"]["createdPlaces"], "Global count changed unexpectedly (possible concurrent writer)")
            require(set(after["sourcePaths"]) == set(before["sourcePaths"]) | {p for p in documents if "/sources/" in p}, "Unexpected source paths after write")
            for path, snapshot in before_snapshots.items():
                if snapshot.exists and "/sources/" not in path:
                    require(snapshot.to_dict()["createdAt"] == after_snapshots[path].to_dict()["createdAt"], "createdAt changed")
            if args.favorites_count:
                require(before["favoritesTotal"] == after["favoritesTotal"], "Favorites count changed (possible app activity); importer never writes favorites")
        report["createdAtByPlace"] = {
            p: s.to_dict()["createdAt"] for p, s in after_snapshots.items() if "/sources/" not in p
        }
        report["status"] = "PASS"
    except Exception as exc:
        report["status"] = "FAIL"
        report["errorType"] = type(exc).__name__
        write_report(report_name, report)
        raise
    finally:
        db.close()
        firebase_admin.delete_app(app)
    report["finishedAt"] = datetime.now(timezone.utc)
    write_report(report_name, report)
    print("AFTER " + dumps(report["after"]), flush=True)
    marker = "HANK_PILOT_DONE" if args.apply else "HANK_PILOT_VERIFIED"
    print(marker + " " + dumps({**manifest["summary"], **report["writes"], "favoritesBefore": before["favoritesTotal"], "favoritesAfter": after["favoritesTotal"]}), flush=True)
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        sys.exit(main())
    except Exception as exc:
        # Credential exceptions can contain local identity/path details; keep them out of logs.
        print(f"HANK_PILOT_FAILED {type(exc).__name__}: " + (str(exc) if isinstance(exc, ValueError) else "See local environment/ADC setup; no success marker emitted."), file=sys.stderr)
        sys.exit(1)
