import unittest
import json
from pathlib import Path
from tools.firestore_place_search_fields.derive import derive_search, pet_sort_key, pet_tier


def place_base(**overrides):
    data = {
        "placeId": "kto-1", "name": "테스트카페", "address": "제주특별자치도 제주시 애월읍 하귀",
        "municipality": "JEJU_CITY", "latitude": 33.46, "longitude": 126.31,
        "coordinateQualityStatus": "OK", "phone": "064-123-4567",
        "primaryImageUrl": "https://example.com/a.jpg", "secondaryImageUrl": None,
        "shortDescription": None, "fullDescription": None, "parkingInfo": None,
        "businessHours": None, "closedDays": None, "instagramUrl": None, "tags": None,
        "serviceCategory": None, "roadAddress": None,
        "petPolicy": {"petInformationStatus": "KTO_OVERLAY_FOUND"},
    }
    data.update(overrides)
    return data


def source_base(**overrides):
    data = {
        "placeSourceId": "kto-areaBasedList2-1", "placeId": "kto-1", "source": "KTO",
        "collector": {"hasPetJoin": "Y"},
        "kto": {
            "contentId": "1", "title": "테스트카페", "addr1": "제주특별자치도 제주시 애월읍 하귀",
            "addr2": "", "contentTypeId": "39", "contentTypeName": "음식점", "cat3": "A05020900",
            "tel": "064-123-4567", "firstImage": "https://example.com/a.jpg", "firstImage2": "",
            "zipcode": "63000", "mapx": 126.31, "mapy": 33.46,
            "pet": {
                "acmpyTypeCd": "전구역 동반가능", "acmpyNeedMtr": "목줄", "acmpyPsblCpam": "전견종",
                "etcAcmpyInfo": "안내", "relaAcdntRiskMtr": "주의", "relaFrnshPrdlst": "배변봉투",
                "relaPosesFclty": "울타리", "relaPurcPrdlst": "간식", "relaRntlPrdlst": "방석",
            },
        },
    }
    data.update(overrides)
    return data


class DeriveTests(unittest.TestCase):
    def test_west_cafe_rich(self):
        search = derive_search(place_base(), source_base())
        self.assertEqual(search["region"], "WEST")
        self.assertEqual(search["category"], "CAFE")
        self.assertEqual(search["petTier"], "RICH")
        self.assertEqual(search["petScore"], 9)
        self.assertGreaterEqual(search["totalScore"], 12)
        self.assertEqual(search["petSortKey"], pet_sort_key("RICH", 9, search["basicScore"]))

    def test_unknown_pet_sort_below_basic(self):
        place = place_base(petPolicy={"petInformationStatus": "UNKNOWN"})
        source = source_base(collector={"hasPetJoin": "N"})
        source["kto"] = {**source["kto"], "pet": None}
        search = derive_search(place, source)
        self.assertEqual(search["petTier"], "UNKNOWN")
        self.assertEqual(search["petScore"], 0)
        rich = pet_sort_key("RICH", 5, 5)
        self.assertLess(search["petSortKey"], rich)

    def test_pet_status_source_consistency(self):
        with self.assertRaisesRegex(ValueError, "pet status mismatch"):
            derive_search(place_base(petPolicy={"petInformationStatus": "UNKNOWN"}), source_base())
        source = source_base(collector={"hasPetJoin": "N"})
        source["kto"] = {**source["kto"], "pet": None}
        with self.assertRaisesRegex(ValueError, "pet status mismatch"):
            derive_search(place_base(petPolicy={"petInformationStatus": "KTO_OVERLAY_FOUND"}), source)
        result = derive_search(place_base(petPolicy={"petInformationStatus": "ADMIN_CONFIRMED"}), source)
        self.assertEqual(result["petTier"], "BASIC")
        missing_pet = source_base(collector={"hasPetJoin": "N"})
        missing_pet["kto"] = {key: value for key, value in missing_pet["kto"].items() if key != "pet"}
        result = derive_search(place_base(petPolicy={"petInformationStatus": "UNKNOWN"}), missing_pet)
        self.assertEqual(result["petTier"], "UNKNOWN")

    def test_shopping_not_cafe_by_title(self):
        source = source_base()
        source["kto"] = {**source["kto"], "contentTypeId": "38", "contentTypeName": "쇼핑", "cat3": "", "title": "바다카페샵"}
        place = place_base(name="바다카페샵")
        search = derive_search(place, source)
        self.assertEqual(search["category"], "SHOPPING")

    def test_idempotent_hash(self):
        a = derive_search(place_base(), source_base())
        b = derive_search(place_base(), source_base())
        self.assertEqual(a["inputHash"], b["inputHash"])

    def test_tier_boundaries(self):
        self.assertEqual(pet_tier("KTO_OVERLAY_FOUND", 5), "RICH")
        self.assertEqual(pet_tier("KTO_OVERLAY_FOUND", 4), "PARTIAL")
        self.assertEqual(pet_tier("KTO_OVERLAY_FOUND", 1), "BASIC")
        self.assertEqual(pet_tier("UNKNOWN", 9), "UNKNOWN")

    def test_admin_effective_input_fixture(self):
        fixture_path = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "searchDerivation.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        search = derive_search(fixture["place"], fixture["source"])
        self.assertEqual(search["region"], "EAST")
        self.assertEqual(search["category"], "SHOPPING")
        self.assertEqual(search["petScore"], 8)
        self.assertEqual(len(search["inputHash"]), 64)


if __name__ == "__main__":
    unittest.main()
