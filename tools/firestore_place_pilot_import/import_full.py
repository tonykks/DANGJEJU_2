"""ADC-only Stage 2 import, with read-only favorites evidence and resumable chunks."""

import argparse
import base64
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import time

import import_pilot as pilot

OUTPUT = pilot.ROOT / "private_probe/firestore_place_full_import"
MANIFEST_NAME = "FULL_MANIFEST.json"
CHUNK_DOCS = 200
require = pilot.require


def canonical(value):
    """Type-tag values for a lossless fingerprint, including timestamp nanoseconds."""
    if isinstance(value, datetime):
        require(value.tzinfo is not None, "Naive timestamp in evidence")
        utc = value.astimezone(timezone.utc)
        seconds = (utc.replace(microsecond=0) - datetime(1970, 1, 1, tzinfo=timezone.utc)).days * 86400
        seconds += utc.hour * 3600 + utc.minute * 60 + utc.second
        # DocumentSnapshot deep-copies timestamps; the SDK's copy can reset the
        # nanosecond property to zero. Firestore stores microsecond precision, so
        # retain the datetime microseconds as the SDK encoder itself does.
        return {"type": "timestamp", "seconds": seconds,
                "nanos": getattr(value, "nanosecond", 0) or value.microsecond * 1000}
    if value is None:
        return ["null"]
    if isinstance(value, bool):
        return ["bool", value]
    if isinstance(value, int):
        return ["int", str(value)]
    if isinstance(value, float):
        return ["float", value.hex() if math.isfinite(value) else str(value)]
    if isinstance(value, str):
        return ["string", value]
    if isinstance(value, bytes):
        return ["bytes", base64.b64encode(value).decode("ascii")]
    if isinstance(value, dict):
        return ["map", [[key, canonical(item)] for key, item in sorted(value.items())]]
    if isinstance(value, (list, tuple)):
        return ["array", [canonical(item) for item in value]]
    # Imported only for unusual extra Firestore fields; no authentication here.
    from google.cloud.firestore_v1 import DocumentReference, GeoPoint
    if isinstance(value, GeoPoint):
        return ["geopoint", canonical(value.latitude), canonical(value.longitude)]
    if isinstance(value, DocumentReference):
        return ["reference", value._document_path]
    raise ValueError("Unsupported Firestore field type in fingerprint")


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2,
                       allow_nan=False, default=lambda v: v.isoformat()) + "\n").encode("utf-8")


def fingerprint(value):
    return hashlib.sha256(json_bytes(canonical(value))).hexdigest()


def output_path(name):
    require(re.fullmatch(r"[A-Za-z0-9_-]+\.json", name), "Expected a simple .json report filename")
    return OUTPUT / name


def available(name):
    require(not output_path(name).exists(), "Evidence exists; choose a new report name before any writes")


def write_json(name, value):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with output_path(name).open("xb") as handle:
        handle.write(json_bytes(value))
        handle.flush()
        os.fsync(handle.fileno())


def read_json(name):
    return json.loads(output_path(name).read_text(encoding="utf-8"))


def favorites_snapshot(db):
    records = []
    seen = set()
    for snapshot in db.collection_group("favorites").stream(timeout=60):
        path = snapshot.reference.path
        require(re.fullmatch(r"users/[^/]+/favorites/[^/]+", path), "Unexpected favorites collection-group path")
        require(path not in seen, "Duplicate favorites snapshot path")
        seen.add(path)
        data = snapshot.to_dict()
        require(isinstance(data.get("placeId"), str), "Favorite placeId missing or invalid")
        require(isinstance(data.get("createdAt"), datetime), "Favorite createdAt missing or invalid")
        require(data["placeId"] == path.split("/")[3], "Favorite path/placeId mismatch")
        records.append({
            "path": path, "uid": path.split("/")[1], "placeId": data["placeId"],
            "createdAt": canonical(data["createdAt"]), "fieldKeys": sorted(data),
            "otherFieldKeys": sorted(set(data) - {"placeId", "createdAt"}),
            # Extra values (including any email) are never saved in plaintext.
            "documentSha256": fingerprint(data),
        })
    records.sort(key=lambda record: record["path"])
    return {"schemaVersion": 1, "projectId": pilot.PROJECT, "databaseId": "(default)",
            "count": len(records), "documents": records, "fingerprintSha256": fingerprint(records)}


def validate_favorites_evidence(evidence):
    require(evidence["projectId"] == pilot.PROJECT and evidence["databaseId"] == "(default)", "Favorites evidence project mismatch")
    records = evidence["documents"]
    require(records == sorted(records, key=lambda record: record["path"]), "Unsorted favorites evidence")
    require(evidence["count"] == len(records) == len({r["path"] for r in records}), "Favorites evidence count mismatch")
    require(evidence["fingerprintSha256"] == fingerprint(records), "Favorites evidence fingerprint mismatch")


def compare_favorites():
    before, after = read_json("FAVORITES_BEFORE.json"), read_json("FAVORITES_AFTER.json")
    validate_favorites_evidence(before)
    validate_favorites_evidence(after)
    byte_equal = output_path("FAVORITES_BEFORE.json").read_bytes() == output_path("FAVORITES_AFTER.json").read_bytes()
    structural_equal = before == after
    return {"status": "PASS" if byte_equal and structural_equal else "FAIL",
            "beforeCount": before["count"], "afterCount": after["count"],
            "byteEqual": byte_equal, "structuralEqual": structural_equal,
            "beforeFingerprintSha256": before["fingerprintSha256"],
            "afterFingerprintSha256": after["fingerprintSha256"],
            "favoritesUnchanged": byte_equal and structural_equal}


def chunks_for(documents, chunk_docs=CHUNK_DOCS):
    require(type(chunk_docs) is int and 2 <= chunk_docs <= CHUNK_DOCS and chunk_docs % 2 == 0,
            "Chunk size must be even and between 2 and 200 documents")
    places = sorted((p for p in documents if re.fullmatch(r"places/kto-[0-9]+", p)),
                    key=lambda p: int(p.split("kto-")[1]))
    ordered = []
    for path in places:
        place_id = path.split("/")[1]
        cid = place_id.removeprefix("kto-")
        source = f"{path}/sources/kto-areaBasedList2-{cid}"
        require(source in documents, "Place/source pair missing")
        require(documents[path]["placeId"] == documents[source]["placeId"] == place_id,
                "Document placeId/path mismatch")
        require(documents[source]["sourceId"] == cid and documents[source]["placeSourceId"] == source.split("/")[-1],
                "Source identity/path mismatch")
        ordered.extend((path, source))
    require(len(ordered) == len(documents) and set(ordered) == set(documents), "Disallowed write path or orphan source")
    require(bool(ordered), "Empty import")
    chunks = [dict((p, documents[p]) for p in ordered[start:start + chunk_docs])
              for start in range(0, len(ordered), chunk_docs)]
    for chunk in chunks:
        # Conservative serialized-payload margins below the Firestore request/document limits.
        require(len(json_bytes(chunk)) < 6 * 1024 * 1024, "Chunk payload exceeds safety budget")
        require(all(len(json_bytes(doc)) < 750 * 1024 for doc in chunk.values()), "Document payload exceeds safety budget")
    return chunks


def inventory(db, documents):
    snapshots = {}
    # Avoid thousands of per-place source queries. Include orphan/extra source paths.
    for query in (db.collection("places"), db.collection_group("sources")):
        for snapshot in query.stream(timeout=90):
            path = snapshot.reference.path
            require(path not in snapshots, "Duplicate catalog snapshot path")
            snapshots[path] = snapshot
    target = {p: s for p, s in snapshots.items() if p in documents}
    outside = {p: s.to_dict() for p, s in snapshots.items() if p not in documents}
    place_paths = sorted(p for p in snapshots if re.fullmatch(r"places/[^/]+", p))
    source_paths = sorted(p for p in snapshots if re.fullmatch(r"places/[^/]+/sources/[^/]+", p))
    summary = {"placesTotal": len(place_paths), "sourcesTotal": len(source_paths),
               "targetPlaces": sum("/sources/" not in p for p in target),
               "targetSources": sum("/sources/" in p for p in target),
               "placePaths": place_paths, "sourcePaths": source_paths,
               "outsideTargetDocuments": len(outside), "outsideTargetSha256": fingerprint(outside)}
    return summary, target


def preflight(snapshots, documents):
    # All known collisions abort before the first write, even in a late chunk.
    for path, expected in documents.items():
        current = snapshots[path].to_dict() if path in snapshots else None
        pilot.validate_existing(path, current, expected)


def append_event(journal, event):
    journal.write(json.dumps(event, sort_keys=True, default=lambda v: v.isoformat()) + "\n")
    journal.flush()
    os.fsync(journal.fileno())


def apply_chunks(db, firestore, chunks, report, journal):
    from google.api_core import exceptions
    transient = (exceptions.ServiceUnavailable, exceptions.DeadlineExceeded,
                 exceptions.InternalServerError, exceptions.ResourceExhausted)
    for number, chunk in enumerate(chunks, 1):
        report["activeChunk"] = number
        event = {"chunk": number, "documents": len(chunk), "payloadSha256": pilot.digest(chunk)}
        append_event(journal, {**event, "state": "STARTED", "at": datetime.now(timezone.utc)})
        for attempt in range(1, 4):
            try:
                # Each fresh transaction re-reads and re-validates every document.
                # SDK retries ABORTED up to 3 times. A lost commit acknowledgement is
                # safe to retry: deterministic paths, stable payload, createdAt retained.
                pilot.upsert_transaction(db, firestore, chunk)
                break
            except transient as exc:
                append_event(journal, {**event, "state": "RETRYABLE_ERROR", "attempt": attempt,
                                       "errorType": type(exc).__name__})
                if attempt == 3:
                    raise
                time.sleep(2 ** (attempt - 1))
        event.update(state="ACKNOWLEDGED", attempts=attempt, at=datetime.now(timezone.utc))
        append_event(journal, event)
        report["acknowledgedChunks"].append(event)
        print(f"CHUNK {number}/{len(chunks)} documents={len(chunk)} acknowledged", flush=True)


def timestamps(snapshots):
    return {p: {key: canonical(value) for key, value in s.to_dict().items()
                if key in ({"importedAt"} if "/sources/" in p else {"createdAt", "updatedAt"})}
            for p, s in sorted(snapshots.items())}


def verify_readback(snapshots, documents, manifest):
    require(set(snapshots) == set(documents), "Imported ID set differs from actual CSV")
    payload_hash = pilot.verify_documents(snapshots, documents)
    require(payload_hash == manifest["payloadSha256"], "Readback payload digest mismatch")
    counts = Counter(s.to_dict()["petPolicy"]["petInformationStatus"]
                     for p, s in snapshots.items() if "/sources/" not in p)
    require(counts["KTO_OVERLAY_FOUND"] == manifest["summary"]["petKnown"] and
            counts["UNKNOWN"] == manifest["summary"]["petUnknown"], "Pet status counts mismatch")
    return payload_hash


def verify_cross_run(final, manifest):
    first, second = read_json("IMPORT_1.json"), read_json("IMPORT_2.json")
    for report in (first, second):
        require(report["status"] == "PASS", "Import report did not pass")
        require(report["manifestSha256"] == pilot.digest(manifest), "Cross-run manifest mismatch")
        require(report["readbackPayloadSha256"] == final["readbackPayloadSha256"], "Cross-run semantic data changed")
        require(report["after"] == final["after"], "Cross-run inventory changed")
    require(second["writes"]["createdPlaces"] == second["writes"]["createdSources"] == 0, "Reimport created additional documents")
    require(second["timestamps"] == final["timestamps"], "Timestamps changed after the second import")
    advanced = Counter()
    for path, fields in first["timestamps"].items():
        later = second["timestamps"][path]
        if "/sources/" not in path:
            require(fields["createdAt"] == later["createdAt"], "Cross-run createdAt changed")
        key = "importedAt" if "/sources/" in path else "updatedAt"
        earlier_time, later_time = fields[key], later[key]
        require((later_time["seconds"], later_time["nanos"]) > (earlier_time["seconds"], earlier_time["nanos"]),
                "Reimport timestamp did not advance")
        advanced[key] += 1
    return {"status": "PASS", "sameIds": True, "sameSemanticPayload": True,
            "createdAtPreserved": True, "advancedTimestamps": dict(advanced), "secondRunCreatedDocuments": 0}


def verify_a_to_j(report, snapshots, documents, manifest):
    rows = pilot.load_rows()
    places = {p: s.to_dict() for p, s in snapshots.items() if "/sources/" not in p}
    sources = {p: s.to_dict() for p, s in snapshots.items() if "/sources/" in p}
    require(report["after"]["placesTotal"] == report["after"]["sourcesTotal"] == len(rows),
            "Global catalog counts differ from CSV; no automatic cleanup")
    require(all(all(p["petPolicy"][k] == "UNKNOWN" for k in pilot.PET_TRI) and
                all(p["amenities"][k] == "UNKNOWN" for k in pilot.AMENITY_TRI) for p in places.values()), "Policy inference found")
    identities = {(s["source"], s["sourceDataset"], s["sourceId"]) for s in sources.values()}
    require(len(identities) == len(rows), "Duplicate source identity")
    duplicate_names = {name: count for name, count in Counter(r["row"]["title"] for r in rows.values()).items() if count > 1}
    for name, count in duplicate_names.items():
        require(sum(p["name"] == name for p in places.values()) == count, "Same-name records merged")
    for p in places.values():
        require(p["placeGroupId"] is None and p["parentPlaceId"] is None and p["relatedPlaceIds"] is None,
                "Inferred place relationship")
    require(places["places/kto-2704351"]["longitude"] == 12.79737228191, "Source anomaly corrected")
    require(places["places/kto-2626708"]["address"] == rows["2626708"]["row"]["addr1"], "addr2 appended to address")
    cross = verify_cross_run(report, manifest)
    favorite_comparison = compare_favorites()
    require(favorite_comparison == read_json("FAVORITES_COMPARE.json") and favorite_comparison["favoritesUnchanged"],
            "Favorites changed")
    protected = read_json("PROTECTED_FILES_BEFORE.json")
    require(all(pilot.sha256(pilot.ROOT / p) == expected for p, expected in protected.items()), "Protected file changed")
    return {
        "A_source": {"status": "PASS", "actualRows": len(rows), "sha256": pilot.CSV_SHA256},
        "B_ids_counts": {"status": "PASS", "places": len(places), "sources": len(sources), "exactCsvIdSet": True},
        "C_pet_status": {"status": "PASS", "known": manifest["summary"]["petKnown"], "unknown": manifest["summary"]["petUnknown"]},
        "D_unknown_policy": {"status": "PASS", "unknownFieldsPerPlace": len(pilot.PET_TRI) + len(pilot.AMENITY_TRI)},
        "E_provenance": {"status": "PASS", "uniqueSourceIdentities": len(identities), "allPayloadsMatch": True},
        "F_separate_places_samples": {"status": "PASS", "duplicateNameGroupsPreserved": len(duplicate_names)},
        "G_timestamps": cross,
        "H_idempotency": {"status": "PASS", "sameIdsAndPayload": True, "secondRunCreatedDocuments": 0},
        "I_favorites": favorite_comparison,
        "J_protected_files": {"status": "PASS", "filesCompared": len(protected), "changed": 0},
    }


def run_catalog(args, name):
    available(name)
    require(name != MANIFEST_NAME, "Report cannot overwrite manifest")
    manifest, documents = pilot.build_plan(full=True)
    chunks = chunks_for(documents, args.chunk_docs)
    if output_path(MANIFEST_NAME).exists():
        require(read_json(MANIFEST_NAME) == manifest, "Full manifest drift; refusing import")
    elif args.dry_run and args.write_manifest:
        write_json(MANIFEST_NAME, manifest)
    else:
        require(args.dry_run, "Create the full manifest with --dry-run --write-manifest first")
    report = {"startedAt": datetime.now(timezone.utc), "mode": "apply" if args.apply else "verify" if args.verify else "dry-run",
              "projectId": pilot.PROJECT, "databaseId": "(default)", "manifestSha256": pilot.digest(manifest),
              "payloadSha256": manifest["payloadSha256"], "selection": manifest["summary"],
              "chunkDocs": args.chunk_docs, "plannedChunks": len(chunks), "acknowledgedChunks": []}
    print("PLAN " + pilot.dumps(manifest["summary"]), flush=True)
    if args.dry_run:
        report.update(status="PASS", setOperations=0)
        write_json(name, report)
        print("HANK_FULL_DRY_RUN", flush=True)
        return
    if args.apply:
        validate_favorites_evidence(read_json("FAVORITES_BEFORE.json"))
    journal_path = OUTPUT / (Path(name).stem + "_JOURNAL.jsonl")
    require(not args.apply or not journal_path.exists(), "Journal exists; choose a new report name")
    db = app = None
    try:
        db, app, firestore = pilot.connect(app_name="place-stage2-full")
        before, before_snapshots = inventory(db, documents)
        report["before"] = before
        report["beforeTimestamps"] = timestamps(before_snapshots)
        preflight(before_snapshots, documents)
        print(f"PREFLIGHT places={before['targetPlaces']} sources={before['targetSources']} conflicts=0", flush=True)
        if args.apply:
            with journal_path.open("x", encoding="utf-8", newline="\n") as journal:
                apply_chunks(db, firestore, chunks, report, journal)
            after, snapshots = inventory(db, documents)
        else:
            after, snapshots = before, before_snapshots
        report["after"] = after
        report["readbackPayloadSha256"] = verify_readback(snapshots, documents, manifest)
        report["timestamps"] = timestamps(snapshots)
        require(after["outsideTargetSha256"] == before["outsideTargetSha256"], "Outside-target catalog documents changed")
        require(set(after["placePaths"]) == set(before["placePaths"]) | {p for p in documents if "/sources/" not in p}, "Unexpected Place path change")
        require(set(after["sourcePaths"]) == set(before["sourcePaths"]) | {p for p in documents if "/sources/" in p}, "Unexpected Source path change")
        for path, fields in report["beforeTimestamps"].items():
            if "/sources/" not in path:
                require(fields["createdAt"] == report["timestamps"][path]["createdAt"], "Existing createdAt changed")
        report["writes"] = {"createdPlaces": after["targetPlaces"] - before["targetPlaces"] if args.apply else 0,
                            "createdSources": after["targetSources"] - before["targetSources"] if args.apply else 0,
                            "setOperations": len(documents) if args.apply else 0,
                            "countBasis": "Before/after inventory; retries may repeat timestamp writes"}
        if args.verify:
            report["checks"] = verify_a_to_j(report, snapshots, documents, manifest)
        report["status"] = "PASS"
    except BaseException as exc:
        report.update(status="FAIL", errorType=type(exc).__name__,
                      recovery="Earlier chunks or an unacknowledged commit may exist. No rollback/delete. Rerun --apply with a new report name after resolving the failure.")
        raise
    finally:
        report["finishedAt"] = datetime.now(timezone.utc)
        write_json(name, report)
        if db is not None:
            db.close()
        if app is not None:
            import firebase_admin
            firebase_admin.delete_app(app)
    print("HANK_FULL_APPLIED" if args.apply else "HANK_FULL_VERIFIED", flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    for flag in ("dry-run", "apply", "verify", "favorites-before", "favorites-after"):
        mode.add_argument("--" + flag, action="store_true")
    parser.add_argument("--full", action="store_true", help="Explicit full scope (already the default for this entry)")
    parser.add_argument("--write-manifest", action="store_true")
    parser.add_argument("--chunk-docs", type=int, default=CHUNK_DOCS)
    parser.add_argument("--report-name")
    args = parser.parse_args(argv)
    require(not args.write_manifest or args.dry_run, "--write-manifest requires --dry-run")
    if args.favorites_before or args.favorites_after:
        require(args.report_name is None, "Favorites evidence filenames are fixed")
        name = "FAVORITES_BEFORE.json" if args.favorites_before else "FAVORITES_AFTER.json"
        available(name)
        if args.favorites_after:
            available("FAVORITES_COMPARE.json")
            validate_favorites_evidence(read_json("FAVORITES_BEFORE.json"))
        db, app, _ = pilot.connect(app_name="place-stage2-favorites-readonly")
        try:
            snapshot = favorites_snapshot(db)
            write_json(name, snapshot)
        finally:
            db.close()
            import firebase_admin
            firebase_admin.delete_app(app)
        print(f"FAVORITES_SNAPSHOT count={snapshot['count']} fingerprint={snapshot['fingerprintSha256']}", flush=True)
        if args.favorites_after:
            comparison = compare_favorites()
            write_json("FAVORITES_COMPARE.json", comparison)
            require(comparison["favoritesUnchanged"], "Favorites changed; see local comparison evidence")
            print("FAVORITES_UNCHANGED true", flush=True)
        return 0
    name = args.report_name or ("RUN_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json")
    run_catalog(args, name)
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        sys.exit(main())
    except Exception as exc:
        # Avoid printing credential/identity details embedded in SDK exceptions.
        detail = str(exc) if isinstance(exc, ValueError) else "Check local ADC/environment; no success marker emitted."
        print(f"HANK_FULL_FAILED {type(exc).__name__}: {detail}", file=sys.stderr)
        sys.exit(1)
