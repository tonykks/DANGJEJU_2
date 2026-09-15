# Firestore Place `search` field recompute

Deterministic derivation of `places/{id}.search` from Place + linked KTO Source.
**Does not create `listView`.** Does not overwrite KTO Source originals.

## Commands

```powershell
# Offline dry-run against Stage3 snapshot (no Firestore)
python tools/firestore_place_search_fields/recompute.py --dry-run

# Unit tests
python -m unittest tools.firestore_place_search_fields.test_derive -v
```

`--apply` is **refused by default** until Owner/Toby approve a live backfill window.

## After data enrichment

1. Ensure Place/Source documents reflect new facts (admin/import path).
2. Run dry-run on a fresh export or approved snapshot; confirm scores/tiers.
3. Owner approves live window (quota healthy).
4. Run apply tool (future) with checkpoint + idempotent `inputHash` (skip unchanged).
5. Verify all 2126 have `search.version == 1`, then enable app query cutover.

## Score contract

`scoreVersion = hank-place-field-audit-v1` (basic 0–15 + pet 0–9).
`petTier`: RICH≥5, PARTIAL 2–4, BASIC overlay 0–1, UNKNOWN.
`petSortKey = tierRank*10000 + petScore*100 + basicScore`.
