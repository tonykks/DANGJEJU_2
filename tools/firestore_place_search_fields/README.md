# Firestore Place `search` field recompute

Deterministic derivation of `places/{id}.search` from Place + linked KTO Source.
**Does not create `listView`.** Does not overwrite KTO Source originals.

## Commands

```powershell
# Offline dry-run against Stage3 snapshot (no Firestore)
python tools/firestore_place_search_fields/recompute.py

# Unit tests
python -m unittest tools.firestore_place_search_fields.test_derive -v

# Live apply (Owner-approved window only). Uses gcloud ADC. Project must match.
python tools/firestore_place_search_fields/recompute.py --apply --confirm-project=dangjeju
```

Checkpoint (resume after quota stop): `private_probe/firestore_query_first/APPLY_CHECKPOINT.json` (local-only).
Missing live Place docs are recorded in `missingPlaceIds` and **not** marked done, so resume retries them.
Current Stage3 snapshot contract is exactly 2126 places/sources (sha gated); refresh `--expected-sha256` when the export changes.

## After data enrichment

1. Ensure Place/Source documents reflect new facts (admin/import path).
2. Run dry-run on a fresh export or approved snapshot; confirm scores/tiers.
3. Owner approves live window (quota healthy).
4. Deploy Firestore indexes and wait READY.
5. Run `--apply --confirm-project=dangjeju` (idempotent via `inputHash`; skip unchanged).
6. On `RESOURCE_EXHAUSTED`: tool stops, saves checkpoint — **do not retry-loop**. Resume later with the same command.
7. Verify places with `search.version == 1`, then Hosting cutover + smoke.

## Score contract

`scoreVersion = hank-place-field-audit-v1` (basic 0–15 + pet 0–9).
`petTier`: RICH≥5, PARTIAL 2–4, BASIC overlay 0–1, UNKNOWN.
`petSortKey = tierRank*10000 + petScore*100 + basicScore`.
