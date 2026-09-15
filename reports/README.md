# Place field audit — data note

- **Live Firestore:** 2026-09-15 Admin probe 1회 → `RESOURCE_EXHAUSTED` / Quota exceeded. **재시도 없음.**
- **Audit input:** `private_probe/firestore_place_ui/catalog_before.json` (Stage3 검증 시 Firestore에서 읽은 places 2126 + sources 2126 스냅샷)
- **Design:** Hank `gpt-6-astra/xhigh` → `private_probe/firestore_place_field_audit/HANK_FIELD_AUDIT_DESIGN.md`, `HANK_FIELD_LIST.json`
- **Runner:** `tools/firestore_place_field_audit/audit_from_snapshot.py` (Firestore 미접속)
- **Score:** basic 0–15 + pet 0–9 = total 0–24 (필드 present당 1점, 가중치 없음)
- PR / Hosting / DB mutate / UI 변경 없음
