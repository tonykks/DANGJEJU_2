"""Deterministic Place.search field derivation (no listView).

Recompute from Place + linked KTO Source. Does not mutate Source or KTO originals.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import unicodedata
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from urllib.parse import urlparse

SCORE_VERSION = "hank-place-field-audit-v1"
SEARCH_VERSION = 1

CONTENT_TYPE_LABELS = {
    "12": "관광지", "14": "문화시설", "15": "축제공연행사",
    "28": "레포츠", "32": "숙박", "38": "쇼핑", "39": "음식점",
}
PET_KEYS = (
    "acmpyTypeCd", "acmpyNeedMtr", "acmpyPsblCpam", "etcAcmpyInfo",
    "relaAcdntRiskMtr", "relaFrnshPrdlst", "relaPosesFclty",
    "relaPurcPrdlst", "relaRntlPrdlst",
)
PLACEHOLDER_TOKENS = {
    "unknown", "null", "none", "undefined", "n/a", "na", "-", "--", "placeholder",
    "미확인", "정보 없음", "정보없음", "미제공", "확인 필요", "확인필요", "미등록", "등록 예정",
}
UI_DEFAULT_TEXTS = {
    "제주 관광 장소", "상세 소개 정보가 아직 등록되지 않았습니다.",
    "주차 정보 미확인", "운영시간 미확인", "주소 미확인", "연락처 미확인", "지역 정보 미확인",
}
SHORT_DESC_REJECT = {
    "12", "14", "15", "28", "32", "38", "39",
    "관광지", "문화시설", "축제공연행사", "레포츠", "숙박", "쇼핑", "음식점",
    "all", "cafe", "spot", "food", "trail", "stay", "카페", "음식점", "숙소", "산책로",
}
NUM_RE = re.compile(r"^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$")
CAFE_TITLE_RE = re.compile(r"카페|커피|베이커리|찻집|\bcaf[eé]\b|\bcoffee\b|\bbakery\b", re.I)


def text_norm(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    s = html.unescape(value)
    s = re.sub(r"<[^>]+>", " ", s)
    s = unicodedata.normalize("NFC", s)
    s = s.replace("\u00a0", " ").replace("\u200b", "").replace("\ufeff", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def is_placeholder(norm: str | None) -> bool:
    if norm is None or norm == "":
        return True
    return norm.casefold() in PLACEHOLDER_TOKENS or norm in UI_DEFAULT_TEXTS


def first_nonblank(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value
    return None


def parse_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        n = float(value)
        return n if n == n and n not in (float("inf"), float("-inf")) else None
    if isinstance(value, str):
        raw = value.strip()
        if not raw or not NUM_RE.match(raw):
            return None
        try:
            n = float(raw)
        except ValueError:
            return None
        return n if n == n and n not in (float("inf"), float("-inf")) else None
    return None


def valid_http_url(value: str) -> str | None:
    candidate = value.strip()
    if not candidate or re.search(r"\s", candidate):
        return None
    if candidate.startswith("http://"):
        candidate = "https://" + candidate[7:]
    parsed = urlparse(candidate)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    if parsed.path == "/place-placeholder.svg":
        return None
    return candidate


def content_type_id(raw: Any) -> str | None:
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, (int, float)):
        return str(int(raw)) if float(raw).is_integer() else str(raw)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def derive_region(place: dict, kto: dict) -> tuple[str, str]:
    address = (place.get("address") if isinstance(place.get("address"), str) else "") or ""
    if not address.strip():
        addr1 = kto.get("addr1") if isinstance(kto.get("addr1"), str) else ""
        address = addr1
    east = re.search(r"구좌|조천|성산|표선", address)
    if east:
        return "EAST", "ADDRESS_EAST"
    west = re.search(r"애월|한림|한경|안덕|대정", address)
    if west:
        return "WEST", "ADDRESS_WEST"
    municipality = place.get("municipality")
    if municipality == "JEJU_CITY":
        return "JEJU_CITY", "MUNICIPALITY"
    if municipality == "SEOGWIPO_CITY":
        return "SEOGWIPO_CITY", "MUNICIPALITY"
    return "UNKNOWN", "UNKNOWN"


def derive_category(kto: dict, title: str) -> tuple[str, str]:
    cid = content_type_id(kto.get("contentTypeId"))
    mapping = {
        "12": ("ATTRACTION", "KTO_CONTENT_TYPE"),
        "14": ("CULTURE", "KTO_CONTENT_TYPE"),
        "15": ("EVENT", "KTO_CONTENT_TYPE"),
        "28": ("LEISURE", "KTO_CONTENT_TYPE"),
        "32": ("STAY", "KTO_CONTENT_TYPE"),
        "38": ("SHOPPING", "KTO_CONTENT_TYPE"),
    }
    if cid in mapping:
        return mapping[cid]
    if cid != "39":
        return "UNKNOWN", "UNKNOWN"
    cat3 = kto.get("cat3")
    if cat3 == "A05020900":
        return "CAFE", "KTO_CAT3"
    if isinstance(cat3, str) and cat3.strip():
        return "FOOD", "KTO_CAT3"
    if CAFE_TITLE_RE.search(title or ""):
        return "CAFE", "TITLE_FALLBACK"
    return "FOOD", "TITLE_FALLBACK"


def present_basic_and_pet(place: dict, source: dict) -> tuple[int, int, str, str]:
    """Return basic_score, pet_score, pet_information_status, display_name."""
    p, s = place, source
    k = s.get("kto") or {}
    place_id = p.get("placeId") or ""
    present_basic = 0

    def add_basic(ok: bool) -> None:
        nonlocal present_basic
        if ok:
            present_basic += 1

    raw_name = first_nonblank(p.get("name"), k.get("title"))
    name_n = text_norm(raw_name) if raw_name is not None else None
    add_basic(bool(name_n) and name_n != place_id and not is_placeholder(name_n))
    display_name = name_n if name_n and name_n != place_id and not is_placeholder(name_n) else (place_id or "")

    code = content_type_id(k.get("contentTypeId"))
    type_name = text_norm(k.get("contentTypeName")) if isinstance(k.get("contentTypeName"), str) else None
    add_basic(bool(code and type_name and CONTENT_TYPE_LABELS.get(code) == type_name and not is_placeholder(type_name)))

    raw_addr = first_nonblank(p.get("roadAddress"), p.get("address"), k.get("addr1"))
    addr_n = text_norm(raw_addr) if raw_addr is not None else None
    add_basic(bool(addr_n) and not is_placeholder(addr_n))

    raw_addr2 = k.get("addr2") if isinstance(k.get("addr2"), str) else None
    addr2_n = text_norm(raw_addr2) if raw_addr2 is not None else None
    add_basic(bool(addr2_n) and not is_placeholder(addr2_n) and addr2_n not in (addr_n or ""))

    lat = parse_number(p.get("latitude") if p.get("latitude") is not None else k.get("mapy"))
    lng = parse_number(p.get("longitude") if p.get("longitude") is not None else k.get("mapx"))
    add_basic(
        p.get("coordinateQualityStatus") != "SOURCE_ANOMALY"
        and lat is not None and lng is not None
        and 32.5 <= lat <= 34.2 and 125.5 <= lng <= 127.2
    )

    raw_phone = first_nonblank(p.get("phone"), k.get("tel"))
    phone_n = text_norm(raw_phone) if raw_phone is not None else None
    add_basic(bool(phone_n) and not is_placeholder(phone_n))

    images = [p.get("primaryImageUrl"), p.get("secondaryImageUrl"), k.get("firstImage"), k.get("firstImage2")]
    add_basic(any(isinstance(c, str) and valid_http_url(c) for c in images))

    raw_short = p.get("shortDescription") if isinstance(p.get("shortDescription"), str) else None
    short_n = text_norm(raw_short) if raw_short is not None else None
    type_name_raw = text_norm(k.get("contentTypeName")) if isinstance(k.get("contentTypeName"), str) else None
    service_cat = text_norm(p.get("serviceCategory")) if isinstance(p.get("serviceCategory"), str) else None
    add_basic(bool(short_n) and not is_placeholder(short_n) and short_n not in SHORT_DESC_REJECT
              and short_n != type_name_raw and short_n != service_cat)

    raw_full = p.get("fullDescription") if isinstance(p.get("fullDescription"), str) else None
    full_n = text_norm(raw_full) if raw_full is not None else None
    short_ok = bool(short_n) and not is_placeholder(short_n) and short_n not in SHORT_DESC_REJECT
    add_basic(bool(full_n) and not is_placeholder(full_n) and not (short_ok and full_n == short_n))

    for key in ("parkingInfo", "businessHours", "closedDays"):
        raw = p.get(key) if isinstance(p.get(key), str) else None
        n = text_norm(raw) if raw is not None else None
        add_basic(bool(n) and not is_placeholder(n))

    raw_ig = p.get("instagramUrl") if isinstance(p.get("instagramUrl"), str) else None
    ig_n = text_norm(raw_ig) if raw_ig is not None else None
    if ig_n:
        url = valid_http_url(ig_n)
        host = urlparse(url).hostname if url else None
        add_basic(bool(url and host and (host == "instagram.com" or host.endswith(".instagram.com"))))
    else:
        add_basic(False)

    tags = p.get("tags")
    if isinstance(tags, list):
        valid = [text_norm(t) for t in tags if isinstance(t, str)]
        add_basic(any(v and not is_placeholder(v) for v in valid))
    else:
        add_basic(False)

    raw_zip = k.get("zipcode") if isinstance(k.get("zipcode"), str) else None
    zip_n = text_norm(raw_zip) if raw_zip is not None else None
    add_basic(bool(zip_n) and not is_placeholder(zip_n))

    status = (p.get("petPolicy") or {}).get("petInformationStatus")
    has_join = (s.get("collector") or {}).get("hasPetJoin")
    pet_obj = k.get("pet")
    overlay = status == "KTO_OVERLAY_FOUND" and has_join == "Y" and isinstance(pet_obj, dict)
    unknown = status == "UNKNOWN" and has_join == "N" and pet_obj is None
    if not overlay and not unknown:
        raise ValueError(f"pet status mismatch for {place_id}")

    pet_score = 0
    if overlay:
        for key in PET_KEYS:
            raw = pet_obj.get(key) if isinstance(pet_obj.get(key), str) else None
            n = text_norm(raw) if raw is not None else None
            if n and not is_placeholder(n):
                pet_score += 1

    return present_basic, pet_score, status, display_name


def pet_tier(status: str, pet_score: int) -> str:
    if status != "KTO_OVERLAY_FOUND":
        return "UNKNOWN"
    if pet_score >= 5:
        return "RICH"
    if pet_score >= 2:
        return "PARTIAL"
    return "BASIC"


def pet_sort_key(tier: str, pet_score: int, basic_score: int) -> int:
    rank = {"RICH": 3, "PARTIAL": 2, "BASIC": 1, "UNKNOWN": 0}[tier]
    return rank * 10000 + pet_score * 100 + basic_score


def canonical_hash(payload: dict) -> str:
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def derive_search(place: dict, source: dict) -> dict:
    """Build search map for a Place document. No listView."""
    kto = source.get("kto") or {}
    basic, pet, status, display_name = present_basic_and_pet(place, source)
    region, region_basis = derive_region(place, kto)
    category, category_basis = derive_category(kto, display_name)
    tier = pet_tier(status, pet)
    sort_key = pet_sort_key(tier, pet, basic)
    primary = source.get("placeSourceId") or source.get("id")
    if not isinstance(primary, str) or not primary or "/" in primary:
        raise ValueError("invalid primarySourceId")
    body = {
        "version": SEARCH_VERSION,
        "region": region,
        "category": category,
        "regionBasis": region_basis,
        "categoryBasis": category_basis,
        "basicScore": basic,
        "petScore": pet,
        "totalScore": basic + pet,
        "scoreVersion": SCORE_VERSION,
        "petTier": tier,
        "petSortKey": sort_key,
        "primarySourceId": primary,
    }
    input_payload = {
        "place": {k: place.get(k) for k in sorted(place) if k not in ("createdAt", "updatedAt", "search")},
        "source": {k: source.get(k) for k in sorted(source) if k not in ("importedAt",)},
        "scoreVersion": SCORE_VERSION,
        "searchVersion": SEARCH_VERSION,
        "derived": {k: body[k] for k in body if k != "inputHash"},
    }
    # Hash excludes derived output values that are computed; hash inputs + rule versions only
    input_payload.pop("derived", None)
    body["inputHash"] = canonical_hash({
        "placeKeys": {k: place.get(k) for k in (
            "placeId", "name", "address", "roadAddress", "municipality", "latitude", "longitude",
            "coordinateQualityStatus", "phone", "primaryImageUrl", "secondaryImageUrl",
            "shortDescription", "fullDescription", "parkingInfo", "businessHours", "closedDays",
            "instagramUrl", "tags", "serviceCategory", "petPolicy",
        )},
        "sourceKeys": {
            "placeSourceId": source.get("placeSourceId"),
            "placeId": source.get("placeId"),
            "source": source.get("source"),
            "collector": source.get("collector"),
            "kto": source.get("kto"),
        },
        "scoreVersion": SCORE_VERSION,
        "searchVersion": SEARCH_VERSION,
    })
    return body
