"""Regression tests for full-import scope, conflicts, retry and favorites evidence."""

import copy
import csv
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import import_full as full
import import_pilot as pilot


class Snapshot:
    def __init__(self, path, data):
        self.reference = SimpleNamespace(path=path)
        self.data = copy.deepcopy(data)
        self.exists = data is not None

    def to_dict(self):
        return copy.deepcopy(self.data)


SERVER_TIME = object()


class FakeTransaction:
    def __init__(self, db):
        self.db = db
        self.pending = []

    def set(self, ref, data, merge):
        assert merge is True
        self.pending.append((ref.path, data))

    def commit(self):
        self.db.attempts += 1
        if self.db.attempts == self.db.fail_before:
            raise RuntimeError("Simulated process failure before commit")
        self.db.clock += timedelta(seconds=1)
        staged = copy.deepcopy(self.db.data)
        for path, data in self.pending:
            staged[path] = {key: self.db.clock if value is SERVER_TIME else copy.deepcopy(value)
                            for key, value in data.items()}
        self.db.data = staged
        self.db.committed.append([path for path, _ in self.pending])
        if self.db.attempts == self.db.lose_ack:
            from google.api_core.exceptions import ServiceUnavailable
            raise ServiceUnavailable("Simulated lost acknowledgement after commit")


def transactional(fn):
    def wrapped(transaction):
        result = fn(transaction)
        transaction.commit()
        return result
    return wrapped


FAKE_FIRESTORE = SimpleNamespace(SERVER_TIMESTAMP=SERVER_TIME, transactional=transactional)


class FakeDB:
    def __init__(self):
        self.data = {}
        self.clock = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.attempts = 0
        self.committed = []
        self.fail_before = self.lose_ack = None

    def document(self, path):
        return SimpleNamespace(path=path)

    def get_all(self, refs, **kwargs):
        return [Snapshot(ref.path, self.data.get(ref.path)) for ref in refs]

    def transaction(self, **kwargs):
        return FakeTransaction(self)


class FullImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest, cls.documents = pilot.build_plan(full=True)

    def small_chunks(self):
        return full.chunks_for(dict(list(self.documents.items())[:6]), 2)

    def test_every_csv_row_and_policy_preserved(self):
        rows = pilot.load_rows()
        self.assertEqual(self.manifest["sourceRows"], len(rows))
        self.assertEqual(set(self.documents), {path for cid in rows for path in
                         (f"places/kto-{cid}", f"places/kto-{cid}/sources/kto-areaBasedList2-{cid}")})
        for cid, metadata in rows.items():
            row = metadata["row"]
            place = self.documents[f"places/kto-{cid}"]
            source = self.documents[f"places/kto-{cid}/sources/kto-areaBasedList2-{cid}"]
            self.assertEqual(place["petPolicy"]["petInformationStatus"], "KTO_OVERLAY_FOUND" if row["has_pet"] == "Y" else "UNKNOWN")
            self.assertTrue(all(place["petPolicy"][k] == "UNKNOWN" for k in pilot.PET_TRI))
            self.assertTrue(all(place["amenities"][k] == "UNKNOWN" for k in pilot.AMENITY_TRI))
            self.assertEqual(source["kto"]["pet"], {k: row["pet_" + k] for k in pilot.PET_FIELDS} if row["has_pet"] == "Y" else None)
            self.assertEqual(place["address"], row["addr1"])
            self.assertIn(f"record={metadata['csvRecord']}", source["rawReference"])

    def test_pilot_manifest_and_payload_unchanged(self):
        manifest, docs = pilot.build_plan()
        self.assertEqual(manifest, json.loads(pilot.MANIFEST.read_text(encoding="utf-8")))
        for path, doc in docs.items():
            self.assertEqual(doc, self.documents[path])

    def test_counts_are_measured_and_duplicate_ids_abort(self):
        with (pilot.ROOT / pilot.CSV_PATH).open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            fields = reader.fieldnames
            rows = list(reader)[:3]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.csv"
            for records in (rows, rows + rows[:1]):
                with path.open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=fields)
                    writer.writeheader()
                    writer.writerows(records)
                with patch.object(pilot, "CSV_PATH", path), patch.object(pilot, "CSV_SHA256", pilot.sha256(path)):
                    if len(records) == 3:
                        self.assertEqual(len(pilot.load_rows()), 3)
                    else:
                        with self.assertRaisesRegex(ValueError, "Duplicate contentId"):
                            pilot.load_rows()

    def test_chunk_boundaries_pairs_and_write_scope(self):
        chunks = full.chunks_for(self.documents)
        self.assertEqual(sum(map(len, chunks)), len(self.documents))
        for chunk in chunks:
            self.assertLessEqual(len(chunk), 200)
            self.assertEqual(len(chunk) % 2, 0)
        for size in (1, 201, 500):
            with self.assertRaises(ValueError):
                full.chunks_for(self.documents, size)
        malicious = dict(self.documents)
        malicious["users/u/favorites/p"] = {"placeId": "p"}
        with self.assertRaisesRegex(ValueError, "Disallowed"):
            full.chunks_for(malicious)
        missing = dict(self.documents)
        missing.pop(next(p for p in missing if "/sources/" in p))
        with self.assertRaisesRegex(ValueError, "pair missing"):
            full.chunks_for(missing)

    def test_late_conflict_aborts_entire_preflight(self):
        path = list(self.documents)[-2]
        current = copy.deepcopy(self.documents[path])
        current.update(createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc))
        current["petPolicy"]["petAcceptance"] = "TRUE"
        with self.assertRaisesRegex(ValueError, "differs"):
            full.preflight({path: Snapshot(path, current)}, self.documents)

    def test_transaction_rechecks_collision_and_writes_nothing(self):
        chunk = self.small_chunks()[0]
        db = FakeDB()
        source_path = list(chunk)[1]
        db.data[source_path] = {**copy.deepcopy(chunk[source_path]), "importedAt": db.clock, "reviewed": True}
        with self.assertRaisesRegex(ValueError, "differs"):
            pilot.upsert_transaction(db, FAKE_FIRESTORE, chunk)
        self.assertEqual(db.committed, [])

    def apply(self, db, chunks):
        with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as journal, patch("builtins.print"), patch.object(full.time, "sleep"):
            report = {"acknowledgedChunks": []}
            full.apply_chunks(db, FAKE_FIRESTORE, chunks, report, journal)
            return report

    def test_partial_failure_resumes_without_duplicates_or_created_at_loss(self):
        db, chunks = FakeDB(), self.small_chunks()
        db.fail_before = 2
        with self.assertRaises(RuntimeError):
            self.apply(db, chunks)
        self.assertEqual(len(db.data), 2)
        first_path = list(chunks[0])[0]
        created_at = db.data[first_path]["createdAt"]
        db.fail_before = None
        self.apply(db, chunks)
        self.assertEqual(set(db.data), set().union(*chunks))
        self.assertEqual(db.data[first_path]["createdAt"], created_at)
        self.assertGreater(db.data[first_path]["updatedAt"], created_at)
        self.assertTrue(all(path.startswith("places/") for paths in db.committed for path in paths))

    def test_lost_commit_acknowledgement_retries_safely(self):
        db, chunks = FakeDB(), self.small_chunks()[:1]
        db.lose_ack = 1
        initial = db.clock
        report = self.apply(db, chunks)
        self.assertEqual(len(db.data), 2)
        self.assertEqual(report["acknowledgedChunks"][0]["attempts"], 2)
        place = db.data[list(chunks[0])[0]]
        self.assertEqual(place["createdAt"], initial + timedelta(seconds=1))
        self.assertEqual(place["updatedAt"], initial + timedelta(seconds=2))

    def test_adc_override_and_emulator_rejected_even_when_empty(self):
        for key in ("GOOGLE_APPLICATION_CREDENTIALS", "FIRESTORE_EMULATOR_HOST"):
            for value in ("", "prohibited"):
                with patch.dict("os.environ", {key: value}), self.assertRaises(ValueError):
                    pilot.connect()

    def test_offline_dry_run_and_evidence_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(full, "OUTPUT", Path(directory)), patch.object(pilot, "connect", side_effect=AssertionError("Must stay offline")), patch("builtins.print"):
            self.assertEqual(full.main(["--dry-run", "--write-manifest", "--report-name", "DRY_RUN.json"]), 0)
            with self.assertRaisesRegex(ValueError, "Evidence exists"):
                full.main(["--apply", "--report-name", "DRY_RUN.json"])


class FavoritesTests(unittest.TestCase):
    def test_fingerprint_is_sorted_private_and_preserves_stored_timestamp_precision(self):
        from google.api_core.datetime_helpers import DatetimeWithNanoseconds
        timestamp = DatetimeWithNanoseconds(2026, 1, 1, nanosecond=123456000, tzinfo=timezone.utc)
        changed_timestamp = DatetimeWithNanoseconds(2026, 1, 1, nanosecond=123457000, tzinfo=timezone.utc)
        self.assertEqual(full.canonical(DatetimeWithNanoseconds(2026, 1, 1, nanosecond=123456789, tzinfo=timezone.utc))["nanos"], 123456789)
        docs = [Snapshot("users/user-b/favorites/place-b", {"placeId": "place-b", "createdAt": timestamp, "email": "private@example.test"}),
                Snapshot("users/user-a/favorites/place-a", {"createdAt": timestamp, "placeId": "place-a"})]
        # This fake exposes no document/set/delete APIs: snapshot must be read-only.
        db = SimpleNamespace(collection_group=lambda name: SimpleNamespace(stream=lambda **kwargs: iter(docs)))
        before = full.favorites_snapshot(db)
        docs.reverse()
        after = full.favorites_snapshot(db)
        self.assertEqual(full.json_bytes(before), full.json_bytes(after))
        self.assertNotIn("private@example.test", full.json_bytes(before).decode())
        self.assertEqual(before["documents"][0]["createdAt"]["nanos"], 123456000)
        docs[0].data["createdAt"] = changed_timestamp
        self.assertNotEqual(before["fingerprintSha256"], full.favorites_snapshot(db)["fingerprintSha256"])
        docs[0].data["createdAt"] = timestamp
        docs[1].data["email"] = "changed@example.test"
        self.assertNotEqual(before["fingerprintSha256"], full.favorites_snapshot(db)["fingerprintSha256"])

    def test_compare_detects_same_count_path_changes(self):
        timestamp = datetime(2026, 1, 1, tzinfo=timezone.utc)
        docs = [Snapshot("users/user-a/favorites/p", {"placeId": "p", "createdAt": timestamp})]
        db = SimpleNamespace(collection_group=lambda name: SimpleNamespace(stream=lambda **kwargs: iter(docs)))
        with tempfile.TemporaryDirectory() as directory, patch.object(full, "OUTPUT", Path(directory)):
            full.write_json("FAVORITES_BEFORE.json", full.favorites_snapshot(db))
            docs[0].reference.path = "users/user-b/favorites/p"
            full.write_json("FAVORITES_AFTER.json", full.favorites_snapshot(db))
            comparison = full.compare_favorites()
            self.assertEqual(comparison["beforeCount"], comparison["afterCount"])
            self.assertFalse(comparison["favoritesUnchanged"])


if __name__ == "__main__":
    unittest.main()
