#!/usr/bin/env python3
"""Offline Place field-richness audit from a frozen Firestore catalog snapshot.

Does NOT connect to Firestore. Input is Stage3 catalog_before.json (places+sources).
Stops if the snapshot hash does not match the Hank design expectation.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SNAPSHOT = ROOT / "private_probe" / "firestore_place_ui" / "catalog_before.json"
DEFAULT_FIELD_LIST = ROOT / "private_probe" / "firestore_place_field_audit" / "HANK_FIELD_LIST.json"
DEFAULT_REPORTS = ROOT / "reports"

PLACEHOLDER_TOKENS = {
    "unknown", "null", "none", "undefined", "n/a", "na", "-", "--", "placeholder",
    "미확인", "정보 없음", "정보없음", "미제공", "확인 필요", "확인필요", "미등록", "등록 예정",
}
UI_DEFAULT_TEXTS = {
    "제주 관광 장소",
    "상세 소개 정보가 아직 등록되지 않았습니다.",
    "주차 정보 미확인",
    "운영시간 미확인",
    "주소 미확인",
    "연락처 미확인",
    "지역 정보 미확인",
}
SHORT_DESC_REJECT = {
    "12", "14", "15", "28", "32", "38", "39",
    "관광지", "문화시설", "축제공연행사", "레포츠", "숙박", "쇼핑", "음식점",
    "all", "cafe", "spot", "food", "trail", "stay",
    "카페", "음식점", "숙소", "산책로",
}
CONTENT_TYPE_LABELS = {
    "12": "관광지", "14": "문화시설", "15": "축제공연행사",
    "28": "레포츠", "32": "숙박", "38": "쇼핑", "39": "음식점",
}
PET_FIELDS = (
    ("pet_acmpyTypeCd", "acmpyTypeCd", "동반 유형"),
    ("pet_acmpyNeedMtr", "acmpyNeedMtr", "동반 시 필요 사항"),
    ("pet_acmpyPsblCpam", "acmpyPsblCpam", "동반 가능 동물"),
    ("pet_etcAcmpyInfo", "etcAcmpyInfo", "기타 동반 안내"),
    ("pet_relaAcdntRiskMtr", "relaAcdntRiskMtr", "관련 사고 위험 사항"),
    ("pet_relaFrnshPrdlst", "relaFrnshPrdlst", "비치 품목"),
    ("pet_relaPosesFclty", "relaPosesFclty", "보유 시설"),
    ("pet_relaPurcPrdlst", "relaPurcPrdlst", "구매 가능 품목"),
    ("pet_relaRntlPrdlst", "relaRntlPrdlst", "대여 가능 품목"),
)
NUM_RE = re.compile(r"^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def text_norm(value) -> str | None:
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
    if norm.casefold() in PLACEHOLDER_TOKENS:
        return True
    if norm in UI_DEFAULT_TEXTS:
        return True
    return False


def first_nonblank(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value
    return None


def parse_number(value):
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


def category_for(content_type_id, cat3, title: str) -> str:
    cid = str(content_type_id or "")
    if cid == "39":
        if cat3 == "A05020900":
            return "cafe"
        if isinstance(cat3, str) and cat3.strip():
            return "food"
        return "cafe" if re.search(r"카페|커피|베이커리|찻집|\bcaf[eé]\b|\bcoffee\b|\bbakery\b", title, re.I) else "food"
    if cid == "32":
        return "stay"
    return "spot"


def region_for(address: str, municipality) -> tuple[str, str]:
    east = re.search(r"구좌|조천|성산|표선", address or "")
    if east:
        return "east", f"동부 ({east.group(0)})"
    west = re.search(r"애월|한림|한경|안덕|대정", address or "")
    if west:
        return "west", f"서부 ({west.group(0)})"
    if municipality == "JEJU_CITY":
        return "jeju_city", "제주시"
    if municipality == "SEOGWIPO_CITY":
        return "seogwipo", "서귀포시"
    return "unknown", "지역 정보 미확인"


def csv_safe(value: str) -> str:
    if not value:
        return value
    if value[0] in ("=", "+", "-", "@", "\t", "\r", "\n"):
        return "'" + value
    return value


def evaluate_place(place_doc: dict, source_doc: dict) -> dict:
    p = place_doc["data"]
    s = source_doc["data"]
    k = s.get("kto") or {}
    place_id = place_doc["id"]
    present = {}
    values = {}
    reasons = {}

    def set_field(fid, ok, value, reason):
        present[fid] = 1 if ok else 0
        values[fid] = value
        reasons[fid] = reason

    # name
    raw_name = first_nonblank(p.get("name"), k.get("title"))
    name_n = text_norm(raw_name) if raw_name is not None else None
    if name_n is None:
        set_field("name", False, None, "missing")
    elif name_n == place_id or is_placeholder(name_n):
        set_field("name", False, name_n, "id_fallback" if name_n == place_id else "placeholder")
    else:
        set_field("name", True, name_n, "present")

    # kto content type
    code = text_norm(k.get("contentTypeId")) if isinstance(k.get("contentTypeId"), str) else (
        str(k.get("contentTypeId")) if k.get("contentTypeId") is not None else None
    )
    if isinstance(k.get("contentTypeId"), (int, float)) and not isinstance(k.get("contentTypeId"), bool):
        code = str(int(k.get("contentTypeId"))) if float(k.get("contentTypeId")).is_integer() else str(k.get("contentTypeId"))
    elif isinstance(k.get("contentTypeId"), str):
        code = k.get("contentTypeId").strip()
    else:
        code = None
    type_name = text_norm(k.get("contentTypeName")) if isinstance(k.get("contentTypeName"), str) else None
    type_value = {"code": code, "name": type_name}
    if code and type_name and CONTENT_TYPE_LABELS.get(code) == type_name and not is_placeholder(type_name):
        set_field("kto_content_type", True, f"{code}:{type_name}", "present")
    elif code or type_name:
        set_field("kto_content_type", False, f"{code or ''}:{type_name or ''}", "invalid_value")
    else:
        set_field("kto_content_type", False, None, "missing")

    # address
    raw_addr = first_nonblank(p.get("roadAddress"), p.get("address"), k.get("addr1"))
    addr_n = text_norm(raw_addr) if raw_addr is not None else None
    if addr_n and not is_placeholder(addr_n):
        set_field("address", True, addr_n, "present")
    elif addr_n:
        set_field("address", False, addr_n, "placeholder")
    else:
        set_field("address", False, None, "missing")

    # address_detail
    raw_addr2 = k.get("addr2") if isinstance(k.get("addr2"), str) else None
    addr2_n = text_norm(raw_addr2) if raw_addr2 is not None else None
    base_addr = addr_n or ""
    if not addr2_n:
        set_field("address_detail", False, None, "missing")
    elif is_placeholder(addr2_n):
        set_field("address_detail", False, addr2_n, "placeholder")
    elif addr2_n in base_addr:
        set_field("address_detail", False, addr2_n, "duplicate")
    else:
        set_field("address_detail", True, addr2_n, "present")

    # coordinates
    lat_raw = p.get("latitude") if p.get("latitude") is not None else k.get("mapy")
    lng_raw = p.get("longitude") if p.get("longitude") is not None else k.get("mapx")
    lat = parse_number(lat_raw)
    lng = parse_number(lng_raw)
    coord_value = f"{lat},{lng}" if lat is not None and lng is not None else None
    if p.get("coordinateQualityStatus") == "SOURCE_ANOMALY":
        set_field("coordinates", False, coord_value, "source_anomaly")
    elif lat is None or lng is None:
        set_field("coordinates", False, coord_value, "missing" if lat is None and lng is None else "invalid_value")
    elif not (32.5 <= lat <= 34.2 and 125.5 <= lng <= 127.2):
        set_field("coordinates", False, coord_value, "out_of_bounds")
    else:
        set_field("coordinates", True, coord_value, "present")

    # phone
    raw_phone = first_nonblank(p.get("phone"), k.get("tel"))
    phone_n = text_norm(raw_phone) if raw_phone is not None else None
    if phone_n and not is_placeholder(phone_n):
        set_field("phone", True, phone_n, "present")
    elif phone_n:
        set_field("phone", False, phone_n, "placeholder")
    else:
        set_field("phone", False, None, "missing")

    # image
    image_candidates = [p.get("primaryImageUrl"), p.get("secondaryImageUrl"), k.get("firstImage"), k.get("firstImage2")]
    valid_images = []
    seen = set()
    for cand in image_candidates:
        if not isinstance(cand, str) or not cand.strip():
            continue
        url = valid_http_url(cand)
        if url and url not in seen:
            seen.add(url)
            valid_images.append(url)
    if valid_images:
        set_field("image", True, valid_images[0], "present")
    elif any(isinstance(c, str) and c.strip() for c in image_candidates):
        set_field("image", False, None, "invalid_url")
    else:
        set_field("image", False, None, "missing")

    # short_description — Place only
    raw_short = p.get("shortDescription") if isinstance(p.get("shortDescription"), str) else None
    short_n = text_norm(raw_short) if raw_short is not None else None
    type_name_raw = text_norm(k.get("contentTypeName")) if isinstance(k.get("contentTypeName"), str) else None
    service_cat = text_norm(p.get("serviceCategory")) if isinstance(p.get("serviceCategory"), str) else None
    if not short_n:
        set_field("short_description", False, None, "missing")
    elif is_placeholder(short_n) or short_n in SHORT_DESC_REJECT or short_n == type_name_raw or short_n == service_cat:
        set_field("short_description", False, short_n, "category_only" if short_n in SHORT_DESC_REJECT or short_n == type_name_raw else "placeholder")
    else:
        set_field("short_description", True, short_n, "present")

    # full_description — Place only
    raw_full = p.get("fullDescription") if isinstance(p.get("fullDescription"), str) else None
    full_n = text_norm(raw_full) if raw_full is not None else None
    if not full_n:
        set_field("full_description", False, None, "missing")
    elif is_placeholder(full_n):
        set_field("full_description", False, full_n, "placeholder")
    elif present.get("short_description") and full_n == values.get("short_description"):
        set_field("full_description", False, full_n, "duplicate")
    else:
        set_field("full_description", True, full_n, "present")

    # parking / hours / closed
    for fid, key, reject_defaults in (
        ("parking_info", "parkingInfo", True),
        ("business_hours", "businessHours", True),
        ("closed_days", "closedDays", True),
    ):
        raw = p.get(key) if isinstance(p.get(key), str) else None
        n = text_norm(raw) if raw is not None else None
        if not n:
            set_field(fid, False, None, "missing")
        elif is_placeholder(n):
            set_field(fid, False, n, "placeholder")
        else:
            set_field(fid, True, n, "present")

    # instagram
    raw_ig = p.get("instagramUrl") if isinstance(p.get("instagramUrl"), str) else None
    ig_n = text_norm(raw_ig) if raw_ig is not None else None
    if not ig_n:
        set_field("instagram_url", False, None, "missing")
    else:
        url = valid_http_url(ig_n)
        host = urlparse(url).hostname if url else None
        if url and host and (host == "instagram.com" or host.endswith(".instagram.com")):
            set_field("instagram_url", True, url, "present")
        else:
            set_field("instagram_url", False, ig_n, "invalid_url")

    # tags
    tags = p.get("tags")
    if tags is None:
        set_field("tags", False, None, "missing")
    elif not isinstance(tags, list):
        set_field("tags", False, None, "invalid_value")
    else:
        valid_tags = []
        seen_t = set()
        for item in tags:
            n = text_norm(item) if isinstance(item, str) else None
            if n and not is_placeholder(n) and n not in seen_t:
                seen_t.add(n)
                valid_tags.append(n)
        if valid_tags:
            set_field("tags", True, "|".join(valid_tags), "present")
        elif len(tags) == 0:
            set_field("tags", False, None, "empty")
        else:
            set_field("tags", False, None, "invalid_value")

    # zipcode
    raw_zip = k.get("zipcode") if isinstance(k.get("zipcode"), str) else None
    zip_n = text_norm(raw_zip) if raw_zip is not None else None
    if not zip_n:
        set_field("zipcode", False, None, "missing")
    elif is_placeholder(zip_n):
        set_field("zipcode", False, zip_n, "placeholder")
    else:
        set_field("zipcode", True, zip_n, "present")

    # pet overlay
    status = (p.get("petPolicy") or {}).get("petInformationStatus")
    has_join = (s.get("collector") or {}).get("hasPetJoin")
    pet_obj = k.get("pet")
    overlay = status == "KTO_OVERLAY_FOUND" and has_join == "Y" and isinstance(pet_obj, dict)
    unknown = status == "UNKNOWN" and has_join == "N" and pet_obj is None
    if not overlay and not unknown:
        raise ValueError(f"pet status mismatch for {place_id}: status={status} hasPetJoin={has_join} pet={type(pet_obj)}")

    pet_details_present = []
    for fid, key, label in PET_FIELDS:
        if not overlay:
            set_field(fid, False, None, "unknown_pet")
            continue
        raw = pet_obj.get(key) if isinstance(pet_obj.get(key), str) else None
        n = text_norm(raw) if raw is not None else None
        if not n:
            set_field(fid, False, None, "missing")
        elif is_placeholder(n):
            set_field(fid, False, n, "placeholder")
        else:
            set_field(fid, True, n, "present")
            pet_details_present.append(f"{label}: {n}")

    basic_ids = [
        "name", "kto_content_type", "address", "address_detail", "coordinates", "phone", "image",
        "short_description", "full_description", "parking_info", "business_hours", "closed_days",
        "instagram_url", "tags", "zipcode",
    ]
    pet_ids = [fid for fid, _, _ in PET_FIELDS]
    basic_score = sum(present[i] for i in basic_ids)
    pet_score = sum(present[i] for i in pet_ids)
    total_score = basic_score + pet_score

    display_name = values.get("name") or place_id
    ui_category = category_for(code, k.get("cat3"), display_name if isinstance(display_name, str) else "")
    ui_region, ui_region_name = region_for(values.get("address") or "", p.get("municipality"))

    return {
        "place_id": place_id,
        "source_id": source_doc["id"],
        "name": values.get("name") or "",
        "municipality": p.get("municipality") or "",
        "ui_region": ui_region,
        "ui_region_name": ui_region_name,
        "kto_content_type_id": code or "",
        "kto_content_type_name": type_name or "",
        "ui_category": ui_category,
        "pet_information_status": status,
        "basic_score": basic_score,
        "pet_score": pet_score,
        "total_score": total_score,
        "filled_count": total_score,
        "total_fields": 24,
        "fullness_pct": float(Decimal(100 * total_score / 24).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "present": present,
        "values": values,
        "reasons": reasons,
        "pet_details_summary": " | ".join(pet_details_present),
        "content_id_num": int(place_id.split("-", 1)[1]),
    }


def load_joined(snapshot_path: Path, expected_sha: str | None):
    actual = sha256_file(snapshot_path)
    if expected_sha and actual != expected_sha:
        raise SystemExit(f"Snapshot sha256 mismatch: expected {expected_sha}, got {actual}")
    data = json.loads(snapshot_path.read_text(encoding="utf-8-sig"))
    places = data["places"]
    sources = data["sources"]
    if len(places) != 2126 or len(sources) != 2126:
        raise SystemExit(f"Unexpected counts places={len(places)} sources={len(sources)}")
    by_place = {}
    for src in sources:
        pid = src["data"]["placeId"]
        if pid in by_place:
            raise SystemExit(f"Multiple sources for {pid}")
        by_place[pid] = src
    rows = []
    for place in places:
        src = by_place.get(place["id"])
        if not src:
            raise SystemExit(f"Missing source for {place['id']}")
        if src["path"] != f"places/{place['id']}/sources/{src['id']}":
            raise SystemExit(f"Bad source path for {place['id']}")
        rows.append(evaluate_place(place, src))
    return actual, rows


def write_place_audit(path: Path, rows: list[dict], snapshot_sha: str, design_version: str):
    field_order = [
        "name", "kto_content_type", "address", "address_detail", "coordinates", "phone", "image",
        "short_description", "full_description", "parking_info", "business_hours", "closed_days",
        "instagram_url", "tags", "zipcode",
    ] + [fid for fid, _, _ in PET_FIELDS]
    labels = {
        "name": "장소명", "kto_content_type": "KTO장소종류", "address": "주소", "address_detail": "추가주소",
        "coordinates": "좌표", "phone": "전화번호", "image": "대표이미지URL",
        "short_description": "한줄설명", "full_description": "상세설명", "parking_info": "주차정보",
        "business_hours": "운영시간", "closed_days": "휴무일", "instagram_url": "인스타그램",
        "tags": "태그", "zipcode": "우편번호",
    }
    for fid, _, label in PET_FIELDS:
        labels[fid] = label

    ranked = sorted(rows, key=lambda r: (-r["total_score"], -r["pet_score"], -r["basic_score"], r["content_id_num"], r["place_id"]))
    for i, row in enumerate(ranked, 1):
        row["rank"] = i

    headers = [
        "rank", "placeId", "name", "municipality", "ui_region", "ui_region_name",
        "kto_content_type_id", "kto_content_type_name", "ui_category", "pet_information_status",
        "basic_score", "pet_score", "total_score", "filled_useful_fields", "total_useful_fields",
        "fullness_pct", "pet_details_summary",
    ]
    for fid in field_order:
        headers.append(f"has_{fid}")
        headers.append(f"value_{fid}")

    headers.extend(["snapshot_sha256", "design_version", "data_note"])

    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in ranked:
            out = {
                "rank": row["rank"],
                "placeId": row["place_id"],
                "name": csv_safe(row["name"]),
                "municipality": row["municipality"],
                "ui_region": row["ui_region"],
                "ui_region_name": row["ui_region_name"],
                "kto_content_type_id": row["kto_content_type_id"],
                "kto_content_type_name": row["kto_content_type_name"],
                "ui_category": row["ui_category"],
                "pet_information_status": row["pet_information_status"],
                "basic_score": row["basic_score"],
                "pet_score": row["pet_score"],
                "total_score": row["total_score"],
                "filled_useful_fields": row["filled_count"],
                "total_useful_fields": row["total_fields"],
                "fullness_pct": row["fullness_pct"],
                "pet_details_summary": csv_safe(row["pet_details_summary"]),
                "snapshot_sha256": snapshot_sha,
                "design_version": design_version,
                "data_note": "Stage3 Firestore snapshot; live read blocked by RESOURCE_EXHAUSTED",
            }
            for fid in field_order:
                out[f"has_{fid}"] = row["present"][fid]
                val = row["values"].get(fid)
                out[f"value_{fid}"] = csv_safe("" if val is None else str(val))
            writer.writerow(out)


def write_coverage(path: Path, rows: list[dict], snapshot_sha: str, design_version: str):
    field_meta = [
        ("name", "장소명", "basic"),
        ("kto_content_type", "KTO 장소 종류", "basic"),
        ("address", "주소", "basic"),
        ("address_detail", "추가 주소", "basic"),
        ("coordinates", "정상 지도 좌표", "basic"),
        ("phone", "전화번호", "basic"),
        ("image", "대표 이미지", "basic"),
        ("short_description", "한 줄 설명", "basic"),
        ("full_description", "상세 설명", "basic"),
        ("parking_info", "주차 정보", "basic"),
        ("business_hours", "운영시간", "basic"),
        ("closed_days", "휴무일", "basic"),
        ("instagram_url", "인스타그램", "basic"),
        ("tags", "태그", "basic"),
        ("zipcode", "우편번호", "basic"),
    ] + [(fid, label, "pet") for fid, _, label in PET_FIELDS]

    headers = [
        "field_id", "label_ko", "group", "places_total", "present_count", "present_pct",
        "missing_count", "overlay_present_count", "overlay_present_pct",
        "snapshot_sha256", "design_version",
    ]
    total = len(rows)
    overlay_rows = [r for r in rows if r["pet_information_status"] == "KTO_OVERLAY_FOUND"]
    overlay_n = len(overlay_rows)

    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for fid, label, group in field_meta:
            present_count = sum(r["present"][fid] for r in rows)
            overlay_present = sum(r["present"][fid] for r in overlay_rows)
            writer.writerow({
                "field_id": fid,
                "label_ko": label,
                "group": group,
                "places_total": total,
                "present_count": present_count,
                "present_pct": float(Decimal(100 * present_count / total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                "missing_count": total - present_count,
                "overlay_present_count": overlay_present,
                "overlay_present_pct": float(Decimal(100 * overlay_present / overlay_n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) if overlay_n else "",
                "snapshot_sha256": snapshot_sha,
                "design_version": design_version,
            })


def write_region_category(path: Path, rows: list[dict], snapshot_sha: str, design_version: str):
    counts = Counter()
    known = Counter()
    for row in rows:
        key = (row["ui_region"], row["ui_region_name"], row["kto_content_type_id"], row["kto_content_type_name"], row["ui_category"])
        counts[key] += 1
        if row["pet_information_status"] == "KTO_OVERLAY_FOUND":
            known[key] += 1
    headers = [
        "ui_region", "ui_region_name", "kto_content_type_id", "kto_content_type_name", "ui_category",
        "place_count", "pet_known_count", "pet_known_pct", "snapshot_sha256", "design_version",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for key in sorted(counts.keys(), key=lambda k: (-counts[k], k[0], k[2], k[4])):
            n = counts[key]
            k = known[key]
            writer.writerow({
                "ui_region": key[0],
                "ui_region_name": key[1],
                "kto_content_type_id": key[2],
                "kto_content_type_name": key[3],
                "ui_category": key[4],
                "place_count": n,
                "pet_known_count": k,
                "pet_known_pct": float(Decimal(100 * k / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                "snapshot_sha256": snapshot_sha,
                "design_version": design_version,
            })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--field-list", type=Path, default=DEFAULT_FIELD_LIST)
    parser.add_argument("--reports-dir", type=Path, default=DEFAULT_REPORTS)
    args = parser.parse_args()

    field_list = json.loads(args.field_list.read_text(encoding="utf-8"))
    design_version = field_list.get("design_version", "hank-place-field-audit-v1")
    expected_sha = field_list.get("source_snapshot", {}).get("sha256")

    snapshot_sha, rows = load_joined(args.snapshot, expected_sha)
    args.reports_dir.mkdir(parents=True, exist_ok=True)

    audit_path = args.reports_dir / "firestore_place_field_audit.csv"
    coverage_path = args.reports_dir / "firestore_field_coverage_summary.csv"
    region_path = args.reports_dir / "firestore_region_category_counts.csv"

    write_place_audit(audit_path, rows, snapshot_sha, design_version)
    write_coverage(coverage_path, rows, snapshot_sha, design_version)
    write_region_category(region_path, rows, snapshot_sha, design_version)

    top = sorted(rows, key=lambda r: (-r["total_score"], -r["pet_score"], -r["basic_score"], r["content_id_num"]))[:10]
    rich = [r for r in rows if r["total_score"] >= 8]
    summary = {
        "places": len(rows),
        "sources": len(rows),
        "known": sum(1 for r in rows if r["pet_information_status"] == "KTO_OVERLAY_FOUND"),
        "unknown": sum(1 for r in rows if r["pet_information_status"] == "UNKNOWN"),
        "design_version": design_version,
        "snapshot_sha256": snapshot_sha,
        "score_max": {"basic": 15, "pet": 9, "total": 24},
        "rich_threshold_total_ge_8": len(rich),
        "score_distribution": dict(sorted(Counter(r["total_score"] for r in rows).items())),
        "top10": [
            {
                "rank": i + 1,
                "placeId": r["place_id"],
                "name": r["name"],
                "basic": r["basic_score"],
                "pet": r["pet_score"],
                "total": r["total_score"],
                "pet_details": r["pet_details_summary"],
                "status": r["pet_information_status"],
            }
            for i, r in enumerate(top)
        ],
        "coverage_highlights": {
            fid: sum(r["present"][fid] for r in rows)
            for fid in ["name", "address", "coordinates", "phone", "image", "parking_info", "business_hours",
                        "short_description", "full_description", "pet_acmpyTypeCd", "pet_acmpyNeedMtr",
                        "pet_acmpyPsblCpam", "pet_etcAcmpyInfo"]
        },
        "reports": [str(audit_path), str(coverage_path), str(region_path)],
        "firestore_live_reads": 1,
        "firestore_live_error": "RESOURCE_EXHAUSTED / Quota exceeded (single Admin probe; no retry)",
        "audit_reads": 0,
        "data_source": str(args.snapshot),
    }
    summary_path = ROOT / "private_probe" / "firestore_place_field_audit" / "GENI_AUDIT_SUMMARY.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "status": "PASS",
        "places": summary["places"],
        "top1": summary["top10"][0],
        "rich_ge_8": summary["rich_threshold_total_ge_8"],
        "reports": summary["reports"],
        "summary": str(summary_path),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
