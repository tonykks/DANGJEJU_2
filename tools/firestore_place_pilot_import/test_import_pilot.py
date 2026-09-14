"""Offline regression checks for the pilot's data-loss and write-scope risks."""

import copy
import csv
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import import_pilot as pilot


class PilotSemanticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest, cls.documents = pilot.build_plan()

    def place(self, cid):
        return self.documents[f"places/kto-{cid}"]

    def source(self, cid):
        return self.documents[f"places/kto-{cid}/sources/kto-areaBasedList2-{cid}"]

    def test_scope_and_diversity(self):
        self.assertEqual(len(self.documents), 40)
        self.assertEqual(self.manifest["summary"]["cities"], {"110": 10, "130": 10})
        self.assertEqual(self.manifest["summary"]["petKnown"], 10)
        self.assertEqual(self.manifest["summary"]["petUnknown"], 10)
        self.assertEqual(set(self.manifest["summary"]["contentTypes"]), {"12", "14", "15", "28", "32", "38", "39"})
        self.assertTrue(all(path.startswith("places/") for path in self.documents))

    def test_every_matrix_tristate_remains_unknown(self):
        with (pilot.ROOT / "private_probe/schema_design/FIELD_MAPPING_MATRIX.csv").open(encoding="utf-8-sig", newline="") as handle:
            fields = [r["field_name"].split(".") for r in csv.DictReader(handle)
                      if r["data_type"] == "TriState"]
        self.assertEqual(len(fields), 15)
        for path, place in self.documents.items():
            if "/sources/" not in path:
                for group, field in fields:
                    self.assertEqual(place[group][field], "UNKNOWN", (path, group, field))
                self.assertIsNone(place["petPolicy"]["petFee"])
                self.assertIsNone(place["petPolicy"]["allowedSizes"])
                self.assertIsNone(place["serviceCategory"])

    def test_pet_observations_do_not_become_policy(self):
        cafe = self.source("3401751")["kto"]["pet"]
        self.assertEqual(cafe["acmpyPsblCpam"], "12kg 이하 동반 가능")
        self.assertEqual(cafe["relaRntlPrdlst"], "강아지 방석")
        self.assertEqual(len(cafe), 9)
        self.assertEqual(self.source("3307106")["kto"]["pet"]["acmpyNeedMtr"], "")
        self.assertIsNone(self.source("3371999")["kto"]["pet"])
        self.assertEqual(self.place("3371999")["petPolicy"]["petInformationStatus"], "UNKNOWN")
        self.assertEqual(self.place("4026831")["petPolicy"]["petInformationStatus"], "KTO_OVERLAY_FOUND")

    def test_address_anomaly_and_duplicate_name_preserved(self):
        self.assertEqual(self.place("2626708")["address"], "제주특별자치도 서귀포시 천제연로 158-4")
        self.assertEqual(self.source("2626708")["kto"]["addr2"], "(중문동)")
        self.assertEqual(self.place("2704351")["longitude"], 12.79737228191)
        self.assertEqual(self.place("2704351")["coordinateQualityStatus"], "SOURCE_ANOMALY")
        self.assertNotEqual(self.place("3371999")["placeId"], self.place("4026831")["placeId"])
        self.assertEqual(self.place("3371999")["name"], self.place("4026831")["name"])
        self.assertIsNone(self.place("3371999")["placeGroupId"])
        self.assertIsNone(self.place("4026831")["relatedPlaceIds"])

    def test_raw_supplement_provenance_and_uniqueness(self):
        tuples = []
        for entry in self.manifest["places"]:
            source = self.source(entry["contentId"])
            tuples.append(tuple(source[k] for k in ("source", "sourceDataset", "sourceId")))
            self.assertIn(f"record={entry['csvRecord']}", source["rawReference"])
            self.assertIn(pilot.CSV_SHA256, source["rawReference"])
            self.assertTrue(source["kto"]["lclsSystm3"])
            self.assertEqual(source["verificationStatus"], "UNVERIFIED")
        self.assertEqual(len(set(tuples)), 20)
        self.assertEqual(self.source("3371999")["kto"]["mapLevel"], 6)
        self.assertIsNone(self.source("4026831")["kto"]["mapLevel"])

    def test_checksum_and_full_import_guards(self):
        with patch.object(pilot, "CSV_SHA256", "changed"):
            with self.assertRaisesRegex(ValueError, "checksum"):
                pilot.build_plan()
        with patch.object(pilot, "PILOT_IDS", pilot.PILOT_IDS + ("131596",)):
            with self.assertRaisesRegex(ValueError, "exactly 20"):
                pilot.build_plan()

    def test_dry_run_never_initializes_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with patch.object(pilot, "OUTPUT", output), patch.object(pilot, "MANIFEST", output / "PILOT_MANIFEST.json"), patch.object(pilot, "connect", side_effect=AssertionError("ADC must not be used")), patch("builtins.print"):
                self.assertEqual(pilot.main(["--dry-run", "--write-manifest", "--report-name", "offline.json"]), 0)
                self.assertTrue((output / "PILOT_MANIFEST.json").exists())

    def test_collision_protects_reviewed_document(self):
        expected = self.place("3401751")
        current = copy.deepcopy(expected)
        current.update(createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc))
        pilot.validate_existing("places/kto-3401751", current, expected)
        current["petPolicy"]["petAcceptance"] = "TRUE"
        with self.assertRaisesRegex(ValueError, "differs"):
            pilot.validate_existing("places/kto-3401751", current, expected)

    def test_source_time_and_coordinate_missing_are_explicit(self):
        self.assertEqual(pilot.source_time("20260911090000"), datetime(2026, 9, 11, tzinfo=timezone.utc))
        self.assertEqual(pilot.coordinate_quality(None, 126.5), "MISSING")
        self.assertEqual(pilot.coordinate_quality(33.4, 12.7), "SOURCE_ANOMALY")
        with self.assertRaisesRegex(ValueError, "Non-finite"):
            pilot.coordinate("NaN")


if __name__ == "__main__":
    unittest.main()
